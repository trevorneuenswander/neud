#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLiveValidationTarget,
  getRepoRoot,
  loadLiveValidationEnv,
} from "./lib/env.mjs";
import {
  extractAuditDefinitions,
  sanitizeAuditRows,
  sanitizeError,
} from "./lib/sanitize.mjs";

const repoRoot = getRepoRoot(import.meta.url);
const { validationEnvExists } = loadLiveValidationEnv(repoRoot);

const FAILING_AUDIT_LABELS = new Set([
  "FAIL when authenticated-only RPCs still grant EXECUTE to anon",
  "FAIL when authenticated-only RPCs still grant EXECUTE to service_role",
]);

function parseAuditStatements(sql) {
  const chunks = sql.split(/;\s*(?:\r?\n|$)/);
  const statements = [];

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) {
      continue;
    }

    const commentLines = [...trimmed.matchAll(/^--\s*(.+)$/gm)].map((match) => match[1].trim());
    const executableSql = trimmed
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim();

    if (!executableSql) {
      continue;
    }

    statements.push({
      label: commentLines.at(-1) ?? "audit_query",
      sql: executableSql,
    });
  }

  return statements;
}

function evaluateSection(section) {
  if (section.error) {
    return {
      ok: false,
      message: section.error.message ?? "query failed",
    };
  }

  if (FAILING_AUDIT_LABELS.has(section.label)) {
    if ((section.rowCount ?? 0) > 0) {
      const offenders = (section.rows ?? [])
        .map((row) => `${row.routine_name ?? row.function_name} -> ${row.grantee}`)
        .join(", ");
      return {
        ok: false,
        message: offenders || "unexpected EXECUTE grants found",
      };
    }

    return {
      ok: true,
      message: "no violations",
    };
  }

  return {
    ok: true,
    message: `${section.rowCount ?? 0} row(s)`,
  };
}

async function main() {
  if (!validationEnvExists) {
    console.error("Missing .env.live-validation.local");
    process.exit(1);
  }

  let target;
  try {
    target = assertLiveValidationTarget();
  } catch (error) {
    console.error(sanitizeError(error).message);
    process.exit(1);
  }

  const auditPath = path.join(repoRoot, "supabase", "audits", "post_019_security_audit.sql");
  const auditSql = fs.readFileSync(auditPath, "utf8");
  const statements = parseAuditStatements(auditSql);

  if (statements.length === 0) {
    console.error("No executable audit statements found in post_019_security_audit.sql");
    process.exit(1);
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.error("Install pg first: npm install --save-dev pg");
    process.exit(1);
  }

  const client = new pg.default.Client({
    connectionString: process.env.NEUD_SUPABASE_DB_URL.trim(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const sections = [];
  try {
    for (const [index, statement] of statements.entries()) {
      const label = statement.label || `query_${index + 1}`;
      try {
        const result = await client.query(statement.sql);
        sections.push({
          label,
          rowCount: result.rowCount,
          rows: sanitizeAuditRows(result.rows ?? []),
        });
      } catch (error) {
        sections.push({
          label,
          error: sanitizeError(error),
        });
      }
    }
  } finally {
    await client.end();
  }

  const checks = sections.map((section) => ({
    label: section.label,
    ...evaluateSection(section),
  }));

  const output = {
    projectRef: target.expectedRef,
    dbHost: target.dbHost,
    auditFile: "supabase/audits/post_019_security_audit.sql",
    note: "Despite filename, audit covers post-023 final state.",
    completedAt: new Date().toISOString(),
    checks,
    sections,
  };

  const outputPath = path.join(repoRoot, "docs", "slice-2.3-security-audit-results.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const definitionsPath = path.join(
    repoRoot,
    "docs",
    "slice-2.3-security-audit-definitions.sql",
  );
  fs.writeFileSync(definitionsPath, extractAuditDefinitions(sections), "utf8");

  console.log(`Wrote sanitized audit results to ${outputPath}`);
  console.log(`Wrote readable function definitions to ${definitionsPath}`);

  for (const check of checks) {
    const marker = check.ok ? "✔" : "✖";
    console.log(`${marker} ${check.label}: ${check.message}`);
  }

  const failedChecks = checks.filter((check) => !check.ok);
  if (failedChecks.length > 0 || sections.some((section) => section.error)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
