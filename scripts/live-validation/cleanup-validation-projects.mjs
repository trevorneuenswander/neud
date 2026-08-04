#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  assertLiveValidationTarget,
  getRepoRoot,
  loadLiveValidationEnv,
} from "./lib/env.mjs";
import { isValidationProjectRecord } from "./lib/access-management-classification.mjs";
import { isProtectedProject } from "./lib/access-management-protected-records.mjs";
import { createLiveValidationDbClient } from "./lib/rpc-schema-probe.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";
import {
  deleteValidationProjectWithAudit,
} from "./lib/validation-project-delete.mjs";
import {
  listValidationFixtures,
  unregisterValidationFixtures,
} from "./lib/validation-fixture-registry.mjs";

const OUTPUT_PATH = "docs/validation-project-cleanup-audit.json";

async function listCandidates(dbClient, repoRoot) {
  const { rows } = await dbClient.query(`
    select id, slug, name, created_at
    from public.projects
    order by created_at asc
  `);

  const registryIds = new Set(
    listValidationFixtures({ fixtureType: "project" }, repoRoot).map(
      (entry) => entry.fixture_id,
    ),
  );

  const candidates = [];
  const seen = new Set();

  for (const row of rows) {
    if (isProtectedProject(row)) {
      continue;
    }
    if (registryIds.has(row.id) || isValidationProjectRecord(row)) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        candidates.push(row);
      }
    }
  }

  return candidates;
}

async function countValidationProjects(dbClient) {
  const { rows } = await dbClient.query(`
    select id, slug, name, is_active, archived_at
    from public.projects
    order by name
  `);
  return rows.filter((row) => isValidationProjectRecord(row));
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  const { validationEnvExists } = loadLiveValidationEnv(repoRoot);

  if (!validationEnvExists) {
    console.error("Missing .env.live-validation.local");
    process.exit(1);
  }

  const target = assertLiveValidationTarget();
  const confirmDelete = process.argv.includes("--confirm-delete-validation-data");

  let dbClient;
  const summary = {
    completedAt: null,
    liveValidationTargetRef: target.expectedRef,
    mode: confirmDelete ? "confirm" : "dry_run",
    diagnosticScriptError: null,
    dataSources: {
      cleanupReadsFrom: "public.projects (NEUD_SUPABASE_DB_URL postgres)",
      cleanupDeletesFrom: "public.projects + dependent tables (postgres, trigger bypass)",
      inventoryReadsFrom: "public.projects (NEUD_SUPABASE_DB_URL postgres)",
      directoryRpcReadsFrom: "public.projects via get_access_management_directory()",
    },
    rootCause:
      "Supabase REST deletes fail silently against enforce_project_manager_minimum; postgres trigger bypass is required.",
    candidates: [],
    deletions: [],
    postDeleteVerification: null,
  };

  try {
    dbClient = await createLiveValidationDbClient();
    const candidates = await listCandidates(dbClient, repoRoot);
    summary.candidates = candidates.map((project) => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
      table: "public.projects",
    }));

    console.log(`Live validation target ref: ${target.expectedRef}`);
    console.log(`Candidate validation projects: ${candidates.length}`);
    console.log("Source table: public.projects (same table inventory and directory RPC use)");

    for (const project of candidates) {
      console.log(`- ${project.id} | ${project.slug} | ${project.name}`);
    }

    if (candidates.length === 0) {
      console.log("No validation projects matched cleanup criteria.");
      summary.postDeleteVerification = {
        remainingValidationProjects: 0,
        ok: true,
      };
      return;
    }

    if (!confirmDelete) {
      console.log("\nDry run only. Re-run with --confirm-delete-validation-data to delete.");
      return;
    }

    for (const project of candidates) {
      if (isProtectedProject(project)) {
        throw new Error(`Refusing protected project: ${project.slug}`);
      }

      const auditEntry = await deleteValidationProjectWithAudit(dbClient, project);
      summary.deletions.push(auditEntry);
      console.log(
        `${auditEntry.deletionSuccess ? "Deleted" : "FAILED"} ${auditEntry.id} | ${auditEntry.slug} | table=${auditEntry.table}`,
      );
      if (auditEntry.error) {
        console.error(`  error: ${auditEntry.error}`);
      }
    }

    const remaining = await countValidationProjects(dbClient);
    summary.postDeleteVerification = {
      remainingValidationProjects: remaining.length,
      remainingProjectSlugs: remaining.map((row) => row.slug),
      ok: remaining.length === 0,
    };

    const deletedIds = summary.deletions
      .filter((entry) => entry.deletionSuccess)
      .map((entry) => entry.id);
    unregisterValidationFixtures(deletedIds);

    const successCount = summary.deletions.filter((entry) => entry.deletionSuccess).length;
    const failureCount = summary.deletions.length - successCount;

    console.log(`\nDeleted ${successCount} validation project(s).`);
    if (failureCount > 0) {
      console.error(`${failureCount} project deletion(s) failed verification.`);
      process.exitCode = 1;
    }
    if (remaining.length > 0) {
      console.error(
        `Post-delete verification: ${remaining.length} validation project(s) still exist.`,
      );
      process.exitCode = 1;
    } else {
      console.log("Post-delete verification: 0 validation projects remain.");
    }
  } catch (error) {
    summary.diagnosticScriptError = sanitizeError(error).message;
    console.error(summary.diagnosticScriptError);
    process.exitCode = 1;
  } finally {
    if (dbClient) {
      await dbClient.end().catch(() => {});
    }
    summary.completedAt = new Date().toISOString();
    const outputPath = path.join(repoRoot, OUTPUT_PATH);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${OUTPUT_PATH}`);
  }
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
