#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import {
  getRepoRoot,
  loadLiveValidationEnv,
} from "./lib/env.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

const BROAD_ARROW_SLUG = "broad-arrow-auctions";
const PROTECTED_SLUGS = new Set([
  "stream-bid-display",
  "stream-ticker",
  "legacy-pylon",
  "legacy-ticker",
]);
const DEFAULT_OBSOLETE_SLUGS = new Set([
  "auction-pylon-display",
  "auction-ticker-overlay",
]);

function parseArgs(argv) {
  return {
    confirm: argv.includes("--confirm"),
  };
}

async function main() {
  const { confirm } = parseArgs(process.argv.slice(2));
  const repoRoot = getRepoRoot(import.meta.url);
  loadLiveValidationEnv(repoRoot);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: project } = await admin
    .from("projects")
    .select("id, slug, name")
    .eq("slug", BROAD_ARROW_SLUG)
    .maybeSingle();

  if (!project) {
    console.error("Broad Arrow project not found in cloud.");
    process.exit(1);
  }

  const { data: displays } = await admin
    .from("displays")
    .select("id, slug, name, is_archived, deleted_at")
    .eq("project_id", project.id);

  const candidates = (displays ?? []).filter(
    (row) =>
      !row.deleted_at &&
      !row.is_archived &&
      DEFAULT_OBSOLETE_SLUGS.has(row.slug) &&
      !PROTECTED_SLUGS.has(row.slug),
  );

  const report = {
    dryRun: !confirm,
    project,
    protectedSlugs: Array.from(PROTECTED_SLUGS),
    candidateCount: candidates.length,
    candidates: candidates.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      action: "archive",
    })),
  };

  console.log(JSON.stringify(report, null, 2));

  if (!confirm) {
    console.log("\nDry run only. Re-run with --confirm to archive obsolete displays.");
    return;
  }

  if (candidates.length === 0) {
    console.log("\nNo obsolete displays to archive.");
    return;
  }

  const now = new Date().toISOString();
  for (const row of candidates) {
    const { error } = await admin
      .from("displays")
      .update({
        is_archived: true,
        archived_at: now,
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("project_id", project.id);
    if (error) {
      throw new Error(`Failed to archive ${row.slug}: ${error.message}`);
    }
  }

  console.log(`\nArchived ${candidates.length} obsolete display(s).`);
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
