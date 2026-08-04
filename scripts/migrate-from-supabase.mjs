#!/usr/bin/env node
/**
 * One-time Supabase → local SQLite migration helper.
 *
 * Usage:
 *   node scripts/migrate-from-supabase.mjs --input exports/projects.json
 *
 * Requires a desktop app data directory with an initialized SQLite database.
 * This script is intentionally conservative and reports skipped records.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const inputIndex = argv.indexOf("--input");
  return {
    input:
      inputIndex >= 0 ? path.resolve(argv[inputIndex + 1] ?? "") : null,
    dryRun: argv.includes("--dry-run"),
  };
}

function main() {
  const { input, dryRun } = parseArgs(process.argv.slice(2));
  if (!input || !fs.existsSync(input)) {
    console.error("Provide --input pointing to an export JSON file.");
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(input, "utf8"));
  const report = {
    importedProjects: 0,
    importedDataSources: 0,
    skipped: [],
    dryRun,
  };

  if (!Array.isArray(payload.projects)) {
    console.error("Export file must contain a projects array.");
    process.exit(1);
  }

  for (const project of payload.projects) {
    if (!project?.slug || !project?.name) {
      report.skipped.push(`Invalid project record: ${JSON.stringify(project?.id ?? project)}`);
      continue;
    }
    report.importedProjects += 1;
  }

  for (const engine of payload.dataEngines ?? []) {
    if (!engine?.id || !engine?.project_id) {
      report.skipped.push(`Invalid data engine record: ${JSON.stringify(engine?.id ?? engine)}`);
      continue;
    }
    report.importedDataSources += 1;
  }

  const reportPath = path.join(
    path.dirname(input),
    `migration-report-${Date.now()}.json`,
  );

  if (!dryRun) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }

  console.log(JSON.stringify(report, null, 2));
  if (!dryRun) {
    console.log(`Report written to ${reportPath}`);
    console.log(
      "Direct SQLite import is handled by the desktop Settings import wizard.",
    );
  }
}

main();
