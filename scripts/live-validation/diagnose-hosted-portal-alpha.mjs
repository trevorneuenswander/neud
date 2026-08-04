#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertLiveValidationTarget,
  getRepoRoot,
  loadLiveValidationEnv,
} from "./lib/env.mjs";
import { isMigrationApplied, TRACKING_TABLE } from "./lib/migrations.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

const MIGRATION_029 = "029_list_project_active_displays.sql";
const MIGRATION_030 = "030_harden_project_active_displays.sql";
const MIGRATION_031 = "031_project_display_sort_order.sql";
const BROAD_ARROW_SLUG = "broad-arrow-auctions";

const PORTAL_ROUTE_CHECKS = [
  "src/app/portal/page.tsx",
  "src/app/portal/projects/page.tsx",
  "src/app/portal/projects/[slug]/displays/page.tsx",
  "src/app/portal/users/page.tsx",
  "src/app/portal/activity/page.tsx",
  "src/app/portal/settings/page.tsx",
  "src/app/portal/profile/page.tsx",
  "src/app/portal/projects/[slug]/displays/[displaySlug]/page.tsx",
  "src/app/portal/projects/[slug]/displays/[displaySlug]/fullscreen/page.tsx",
  "src/app/view/[projectSlug]/[displaySlug]/page.tsx",
  "src/app/view/[projectSlug]/[displaySlug]/fullscreen/page.tsx",
];

function isLocalOnlyPhotoReference(value) {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return (
    /^file:/i.test(trimmed) ||
    /^[a-zA-Z]:\\/.test(trimmed) ||
    /127\.0\.0\.1|localhost/i.test(trimmed) ||
    trimmed.includes("/api/offline-assets/")
  );
}

function resolveHostedPhotoUrl(entry) {
  if (typeof entry === "string") {
    return isLocalOnlyPhotoReference(entry) ? null : entry.startsWith("https://") ? entry : null;
  }
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const remote = entry.remoteUrl ?? entry.originalUrl;
  if (typeof remote === "string" && remote.startsWith("https://") && !isLocalOnlyPhotoReference(remote)) {
    return remote;
  }
  return null;
}

function summarizePhotoSources(payload) {
  const photos =
    payload?.auctionDisplay &&
    typeof payload.auctionDisplay === "object" &&
    Array.isArray(payload.auctionDisplay.photos)
      ? payload.auctionDisplay.photos
      : [];

  let localAvailableCount = 0;
  let remoteAvailableCount = 0;
  let hostedSelectedRemoteCount = 0;
  let rejectedLocalOnlyUrlCount = 0;

  for (const entry of photos) {
    if (typeof entry === "string") {
      if (isLocalOnlyPhotoReference(entry)) {
        localAvailableCount += 1;
        rejectedLocalOnlyUrlCount += 1;
      } else if (entry.startsWith("https://")) {
        remoteAvailableCount += 1;
        hostedSelectedRemoteCount += 1;
      }
      continue;
    }

    if (entry && typeof entry === "object") {
      const local = entry.localUrl;
      const remote = entry.remoteUrl ?? entry.originalUrl;
      if (typeof local === "string" && local.trim()) {
        localAvailableCount += 1;
      }
      if (typeof remote === "string" && remote.startsWith("https://")) {
        remoteAvailableCount += 1;
      }
      if (resolveHostedPhotoUrl(entry)) {
        hostedSelectedRemoteCount += 1;
      } else if (
        (typeof local === "string" && local.trim()) ||
        (typeof entry === "string" && isLocalOnlyPhotoReference(entry))
      ) {
        rejectedLocalOnlyUrlCount += 1;
      }
    }
  }

  const photoSourceMode =
    localAvailableCount > 0 && hostedSelectedRemoteCount > 0
      ? "mixed"
      : hostedSelectedRemoteCount > 0
        ? "remote"
        : localAvailableCount > 0
          ? "local"
          : "none";

  return {
    photoSourceMode,
    localAvailableCount,
    remoteAvailableCount,
    hostedSelectedRemoteCount,
    rejectedLocalOnlyUrlCount,
    photoCount: photos.length,
  };
}

async function loadFingerprintModule(repoRoot) {
  try {
    const moduleUrl = pathToFileURL(
      path.join(repoRoot, "src/lib/hosted/canonical-payload-fingerprint.ts"),
    ).href;
    return await import(moduleUrl);
  } catch {
    return null;
  }
}

async function loadMigrationFlags(dbUrl) {
  if (!dbUrl) {
    return {
      trackingTable: TRACKING_TABLE,
      migration029Applied: null,
      migration030Applied: null,
      migration031Applied: null,
    };
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    return {
      trackingTable: TRACKING_TABLE,
      migration029Applied: null,
      migration030Applied: null,
      migration031Applied: null,
      migrationProbeError: "pg module unavailable",
    };
  }

  const client = new pg.default.Client({
    connectionString: dbUrl.trim(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const migration029Applied = await isMigrationApplied(client, MIGRATION_029);
    const migration030Applied = await isMigrationApplied(client, MIGRATION_030);
    const migration031Applied = await isMigrationApplied(client, MIGRATION_031);
    return {
      trackingTable: TRACKING_TABLE,
      migration029Applied,
      migration030Applied,
      migration031Applied,
    };
  } finally {
    await client.end();
  }
}

function summarizeDisplayRows(rows) {
  const activeRows = rows.filter((row) => !row.deleted_at && !row.is_archived);
  return {
    totalActive: activeRows.length,
    enabledCount: activeRows.filter((row) => row.enabled).length,
    disabledCount: activeRows.filter((row) => !row.enabled).length,
    onlineViewerOnCount: activeRows.filter((row) => row.online_viewer_enabled).length,
    onlineViewerOffCount: activeRows.filter((row) => !row.online_viewer_enabled).length,
    publishedCount: activeRows.filter((row) => row.online_published_revision_id).length,
    unpublishedCount: activeRows.filter((row) => !row.online_published_revision_id).length,
    publishErrorCount: activeRows.filter((row) => row.online_publish_error).length,
    archivedExcludedCount: rows.filter((row) => row.is_archived).length,
    deletedExcludedCount: rows.filter((row) => row.deleted_at).length,
  };
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  loadLiveValidationEnv(repoRoot);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const dbUrl = process.env.NEUD_SUPABASE_DB_URL?.trim() ?? null;

  if (!url || !publishableKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or publishable key.");
    process.exit(1);
  }

  let targetRef = "unknown";
  try {
    targetRef = assertLiveValidationTarget().expectedRef;
  } catch {
    targetRef = new URL(url).hostname.split(".")[0];
  }

  const migrationFlags = await loadMigrationFlags(dbUrl);
  const fingerprintModule = await loadFingerprintModule(repoRoot);

  const admin = serviceRoleKey
    ? createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  const { data: projectRows } = admin
    ? await admin.from("projects").select("id, slug, name").order("name")
    : { data: [] };

  const projects = projectRows ?? [];
  const broadArrow = projects.find((project) => project.slug === BROAD_ARROW_SLUG) ?? null;

  const projectSummaries = [];
  let allDisplayRows = [];

  if (admin) {
    for (const project of projects) {
      let activeDisplayCount = null;
      if (migrationFlags.migration029Applied) {
        const { data: counts } = await admin.rpc("count_active_displays_for_projects", {
          p_project_ids: [project.id],
        });
        activeDisplayCount = Number(counts?.[0]?.active_display_count ?? 0);
      }

      const { data: displayRows } = await admin
        .from("displays")
        .select(
          "id, project_id, slug, enabled, online_viewer_enabled, online_published_revision_id, online_publish_error, is_archived, deleted_at",
        )
        .eq("project_id", project.id);

      const rows = displayRows ?? [];
      allDisplayRows = allDisplayRows.concat(rows);
      const stats = summarizeDisplayRows(rows);

      projectSummaries.push({
        slug: project.slug,
        activeDisplayCount,
        listLengthMatchesCount:
          activeDisplayCount == null ? null : activeDisplayCount === stats.totalActive,
        ...stats,
      });
    }
  }

  let viewerSummary = {
    sampleProjectSlug: null,
    sampleDisplaySlug: null,
    rpcOk: null,
    publisherOnline: null,
    publisherHeartbeatAgeSeconds: null,
    canonicalRevision: null,
    payloadFingerprint: null,
    sourceMode: null,
    sourceConnected: null,
    canonicalDataPresent: null,
    ...summarizePhotoSources(null),
  };

  if (admin && broadArrow) {
    const eligible = allDisplayRows.find(
      (row) =>
        row.project_id === broadArrow.id &&
        row.enabled &&
        row.online_viewer_enabled &&
        row.online_published_revision_id &&
        !row.deleted_at &&
        !row.is_archived,
    );

    if (eligible) {
      const { data, error } = await admin.rpc("get_online_display_viewer_bundle", {
        p_project_slug: broadArrow.slug,
        p_display_slug: eligible.slug,
      });

      const bundle = data && typeof data === "object" ? data : null;
      const payload =
        bundle?.canonical_payload && typeof bundle.canonical_payload === "object"
          ? bundle.canonical_payload
          : null;
      const heartbeatAt = bundle?.publisher_last_heartbeat_at ?? null;
      const heartbeatAgeSeconds =
        heartbeatAt != null
          ? Math.max(0, Math.round((Date.now() - Date.parse(String(heartbeatAt))) / 1000))
          : null;

      viewerSummary = {
        sampleProjectSlug: broadArrow.slug,
        sampleDisplaySlug: eligible.slug,
        rpcOk: Boolean(bundle?.ok) && !error,
        publisherOnline: bundle?.publisher_online ?? null,
        publisherHeartbeatAgeSeconds: heartbeatAgeSeconds,
        canonicalRevision: bundle?.canonical_revision ?? null,
        payloadFingerprint: fingerprintModule?.fingerprintCanonicalPayloadContent
          ? fingerprintModule.fingerprintCanonicalPayloadContent(payload)
          : null,
        cloudPayloadHashPrefix:
          typeof bundle?.canonical_payload_hash === "string"
            ? bundle.canonical_payload_hash.slice(0, 12)
            : null,
        lastPublicationRequestedAt: null,
        sourceMode: bundle?.source_mode ?? null,
        sourceConnected: bundle?.source_connected ?? null,
        canonicalDataPresent: bundle?.canonical_data_present ?? null,
        ...summarizePhotoSources(payload),
      };
    }
  }

  const portalRoutes = Object.fromEntries(
    PORTAL_ROUTE_CHECKS.map((relativePath) => [
      relativePath.replace(/^src\/app/, "").replace(/\/page\.tsx$/, "") || "/",
      fs.existsSync(path.join(repoRoot, relativePath)),
    ]),
  );

  const activityPage = fs.readFileSync(
    path.join(repoRoot, "src/components/hosted/HostedActivityFullView.tsx"),
    "utf8",
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    supabaseProjectRef: targetRef,
    migration: {
      trackingTable: migrationFlags.trackingTable,
      migration029Applied: migrationFlags.migration029Applied,
      migration030Applied: migrationFlags.migration030Applied,
      migration031Applied: migrationFlags.migration031Applied,
    },
    projects: {
      accessibleProjectCount: projects.length,
      broadArrowPresent: Boolean(broadArrow),
      broadArrowSlug: broadArrow?.slug ?? null,
      projectSummaries,
    },
    displays: summarizeDisplayRows(allDisplayRows),
    viewer: viewerSummary,
    activity: {
      authorizedActivityRowCount: null,
      filtersAvailable: [
        "project",
        "user",
        "event",
        "search",
        "order",
      ],
      csvExportAvailable:
        activityPage.includes("ActivityExportButton") && activityPage.includes("toHostedCsvRows"),
    },
    portalRoutes,
  };

  if (admin) {
    const { count } = await admin
      .from("activity_events")
      .select("id", { count: "exact", head: true });
    summary.activity.authorizedActivityRowCount = count ?? 0;
  }

  const outputPath = path.join(repoRoot, "docs", "hosted-portal-alpha-diagnostic.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
