#!/usr/bin/env node
/**
 * Static validation for supabase/migrations/011_activity_events.sql
 * Ensures the migration is safe for hosted Supabase without public.projects.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, "../supabase/migrations/011_activity_events.sql");
const sql = fs.readFileSync(migrationPath, "utf8");
const sqlWithoutComments = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const forbiddenPatterns = [
  { pattern: /references\s+public\.projects/i, label: "FK to public.projects" },
  { pattern: /references\s+auth\.users/i, label: "FK to auth.users" },
  { pattern: /is_project_member\s*\(/i, label: "is_project_member() RLS helper" },
  { pattern: /is_platform_admin\s*\(/i, label: "is_platform_admin() RLS helper" },
  { pattern: /create\s+policy/i, label: "authenticated RLS policy (transitional deny-by-default)" },
  { pattern: /using\s*\(\s*true\s*\)/i, label: "insecure using(true) policy" },
  { pattern: /create\s+table\s+public\.projects/i, label: "placeholder projects table" },
  { pattern: /create\s+table\s+public\.teams/i, label: "placeholder teams table" },
];

const requiredPatterns = [
  /create table if not exists public\.activity_events/i,
  /project_id uuid/i,
  /team_id uuid/i,
  /user_id uuid/i,
  /enable row level security/i,
  /source_instance_id uuid not null/i,
  /activity_events_project_id_idx/i,
  /activity_events_team_id_idx/i,
  /activity_events_updated_at_id_idx/i,
];

let failed = false;

for (const { pattern, label } of forbiddenPatterns) {
  if (pattern.test(sqlWithoutComments)) {
    console.error(`FAIL: found forbidden pattern — ${label}`);
    failed = true;
  }
}

for (const pattern of requiredPatterns) {
  if (!pattern.test(sql)) {
    console.error(`FAIL: missing required pattern — ${pattern}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("Activity migration static validation passed.");
console.log("- No FK references to missing cloud tables");
console.log("- No authenticated RLS policies (transitional deny-by-default)");
console.log("- Required columns and indexes present");
