#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import {
  getRepoRoot,
  loadLiveValidationEnv,
} from "./lib/env.mjs";
import { readLocalBroadArrowState } from "./lib/local-neud-db.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

const BROAD_ARROW_SLUG = "broad-arrow-auctions";
const INTENDED_ACTIVE_SLUGS = new Set([
  "stream-bid-display",
  "stream-ticker",
  "legacy-pylon",
  "legacy-ticker",
]);
const LEGACY_OBSOLETE_SLUGS = new Set([
  "auction-pylon-display",
  "auction-ticker-overlay",
]);

function classifyDisplay(input) {
  const { localPresent, cloudPresent, slug, archived, deleted } = input;
  if (deleted) {
    return "deleted";
  }
  if (archived) {
    return "archived";
  }
  if (INTENDED_ACTIVE_SLUGS.has(slug)) {
    return "intended active";
  }
  if (LEGACY_OBSOLETE_SLUGS.has(slug)) {
    return "legacy active";
  }
  if (cloudPresent && !localPresent) {
    return "cloud-only stale";
  }
  return "unknown";
}

async function main() {
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

  const localState = await readLocalBroadArrowState(repoRoot);
  const { data: project } = await admin
    .from("projects")
    .select("id, slug, name")
    .eq("slug", BROAD_ARROW_SLUG)
    .maybeSingle();

  let cloudRows = [];
  if (project?.id) {
    const { data } = await admin
      .from("displays")
      .select(
        "id, slug, name, enabled, is_archived, deleted_at, online_viewer_enabled, online_published_revision_id, online_publish_error, sort_order",
      )
      .eq("project_id", project.id)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    cloudRows = data ?? [];
  }

  const localBySlug = new Map(
    (localState.displays ?? []).map((row) => [row.slug ?? row.displayKey, row]),
  );
  const cloudBySlug = new Map(cloudRows.map((row) => [row.slug, row]));
  const allSlugs = new Set([...localBySlug.keys(), ...cloudBySlug.keys()].filter(Boolean));

  const rows = Array.from(allSlugs)
    .sort((left, right) => String(left).localeCompare(String(right)))
    .map((slug) => {
      const local = localBySlug.get(slug) ?? null;
      const cloud = cloudBySlug.get(slug) ?? null;
      const archived = Boolean(cloud?.is_archived ?? local?.archived);
      const deleted = Boolean(cloud?.deleted_at);
      const classification = classifyDisplay({
        slug,
        localPresent: Boolean(local),
        cloudPresent: Boolean(cloud),
        archived,
        deleted,
      });
      return {
        id: cloud?.id ?? local?.id ?? null,
        slug,
        name: cloud?.name ?? local?.name ?? slug,
        localPresent: Boolean(local),
        cloudPresent: Boolean(cloud),
        matchedBy:
          local && cloud ? (local.id === cloud.id ? "id" : "slug") : local ? "local-only" : "cloud-only",
        enabled: cloud?.enabled ?? local?.localEnabled ?? null,
        archived,
        deleted,
        onlineViewerEnabled:
          cloud?.online_viewer_enabled ?? local?.localOnlineViewerEnabled ?? null,
        published: Boolean(cloud?.online_published_revision_id ?? local?.localPublishedRevisionId),
        sortOrder: cloud?.sort_order ?? local?.sortOrder ?? null,
        selectedRevisionPresent: Boolean(
          local?.selectedRevisionExistsLocally ?? cloud?.online_published_revision_id,
        ),
        classification,
      };
    });

  const summary = {
    generatedAt: new Date().toISOString(),
    broadArrowProject: project ?? null,
    localDatabaseAvailable: localState.available,
    intendedActiveSlugs: Array.from(INTENDED_ACTIVE_SLUGS),
    legacyObsoleteSlugs: Array.from(LEGACY_OBSOLETE_SLUGS),
    totalRows: rows.length,
    intendedActiveCount: rows.filter((row) => row.classification === "intended active").length,
    legacyActiveCount: rows.filter((row) => row.classification === "legacy active").length,
    cloudOnlyStaleCount: rows.filter((row) => row.classification === "cloud-only stale").length,
    hostedActiveEligibleCount: cloudRows.filter(
      (row) => !row.deleted_at && !row.is_archived,
    ).length,
    rows,
  };

  const outputPath = path.join(repoRoot, "docs", "broad-arrow-display-inventory.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
