#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLiveValidationTarget,
  getRepoRoot,
  loadLiveValidationEnv,
} from "./lib/env.mjs";
import { isMigrationApplied, TRACKING_TABLE } from "./lib/migrations.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";
import {
  createAnonClient,
  signInClient,
} from "./lib/supabase-test-helpers.mjs";

import {
  buildAlignedConnectionSection,
  ACTIVE_BROAD_ARROW_DISPLAY_SLUGS,
  summarizeLeaseRow,
  PUBLISHER_STALE_SECONDS,
} from "./lib/broad-arrow-connection-diagnostic.mjs";

const PROJECT_SLUG = "broad-arrow-auctions";
const MIGRATION_026 = "026_fix_viewer_bundle_rpc.sql";
const MIGRATION_027 = "027_viewer_bundle_publisher_heartbeat.sql";
const MIGRATION_028 = "028_viewer_status_semantics.sql";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ageSeconds(iso) {
  if (!iso) {
    return null;
  }
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return Math.max(0, Math.round(ms / 1000));
}

function categorizeRpcError(error) {
  const code = error?.code?.toLowerCase() ?? "";
  const message = error?.message?.toLowerCase() ?? "";
  if (code.includes("pgrst") || message.includes("column") || message.includes("field")) {
    return "temporary_cloud_error";
  }
  if (message.includes("jwt") || message.includes("auth") || code === "401") {
    return "authentication_required";
  }
  return "temporary_cloud_error";
}

function summarizeRpcCall({ data, error, sessionAvailable, membershipAccess }) {
  const row = isRecord(data) ? data : null;
  const rpcSuccess = Boolean(row?.ok === true && row?.code === "viewer_ready" && !error);

  return {
    rpcSuccess,
    rpcErrorCategory: error
      ? categorizeRpcError(error)
      : row?.ok === false
        ? row.code ?? "unknown"
        : null,
    topLevelKeys: row ? Object.keys(row) : [],
    code: row?.code ?? (error ? categorizeRpcError(error) : null),
    projectSlug: row?.project?.slug ?? null,
    displaySlug: row?.display?.slug ?? null,
    publishedRevisionId: row?.display?.published_revision_id ?? null,
    htmlPresent: Boolean(row?.html_content && row.html_content.length > 0),
    htmlLength: typeof row?.html_content === "string" ? row.html_content.length : 0,
    canonicalPayloadPresent: Boolean(
      row?.canonical_payload &&
        isRecord(row.canonical_payload) &&
        Object.keys(row.canonical_payload).length > 0,
    ),
    canonicalDataPresent: Boolean(
      row?.canonical_payload &&
        isRecord(row.canonical_payload) &&
        Object.keys(row.canonical_payload).length > 0,
    ),
    canonicalRevision:
      typeof row?.canonical_revision === "number" ? row.canonical_revision : null,
    stale: typeof row?.stale === "boolean" ? row.stale : null,
    sourceOffline: typeof row?.source_offline === "boolean" ? row.source_offline : null,
    publisherOnline: typeof row?.publisher_online === "boolean" ? row.publisher_online : null,
    sourceConnected: typeof row?.source_connected === "boolean" ? row.source_connected : null,
    sourceMode: typeof row?.source_mode === "string" ? row.source_mode : null,
    dataStale: typeof row?.data_stale === "boolean" ? row.data_stale : null,
    staleReason: typeof row?.stale_reason === "string" ? row.stale_reason : null,
    canonicalDataPresent:
      typeof row?.canonical_data_present === "boolean" ? row.canonical_data_present : null,
    snapshotAgeInformationalOnly: true,
    leasePresent: null,
    leaseExpired: null,
    lastHeartbeatAgeSeconds: null,
    snapshotPresent: null,
    snapshotAgeSeconds: null,
    viewerStaleThresholdSeconds: PUBLISHER_STALE_SECONDS,
    sessionAvailable,
    membershipAccess,
    rpcMessageCategory: error?.message
      ? error.message.split(":")[0]?.trim() ?? "rpc_error"
      : null,
  };
}

async function loadMigrationFlags(dbUrl) {
  if (!dbUrl) {
    return { trackingTable: TRACKING_TABLE, migration026Applied: null, migration027Applied: null, migration028Applied: null };
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    return {
      trackingTable: TRACKING_TABLE,
      migration026Applied: null,
      migration027Applied: null,
      migrationProbeError: "pg module unavailable",
    };
  }

  const client = new pg.default.Client({
    connectionString: dbUrl.trim(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return {
      trackingTable: TRACKING_TABLE,
      migration026Applied: await isMigrationApplied(client, MIGRATION_026),
      migration027Applied: await isMigrationApplied(client, MIGRATION_027),
      migration028Applied: await isMigrationApplied(client, MIGRATION_028),
    };
  } finally {
    await client.end();
  }
}

async function loadCloudPublishingContext(admin, projectId) {
  if (!admin || !projectId) {
    return null;
  }

  const [{ data: lease }, { data: snapshot }] = await Promise.all([
    admin.from("project_publisher_leases").select("*").eq("project_id", projectId).maybeSingle(),
    admin
      .from("project_canonical_snapshots")
      .select("received_at, updated_at")
      .eq("project_id", projectId)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const now = Date.now();
  const leaseExpired =
    !lease?.lease_expires_at || Date.parse(lease.lease_expires_at) <= now;

  return {
    leasePresent: Boolean(lease && !lease.released_at),
    leaseExpired,
    lastHeartbeatAgeSeconds: ageSeconds(lease?.last_heartbeat_at),
    snapshotPresent: Boolean(snapshot),
    snapshotAgeSeconds: ageSeconds(snapshot?.received_at ?? snapshot?.updated_at),
  };
}

async function resolveMembershipAccess(admin, projectId, userId) {
  if (!admin || !projectId || !userId) {
    return "unknown";
  }

  const { data, error } = await admin
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return "unknown";
  }

  return data?.user_id ? "granted" : "denied";
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  loadLiveValidationEnv(repoRoot);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const dbUrl = process.env.NEUD_SUPABASE_DB_URL?.trim() ?? null;
  const viewerEmail =
    process.env.NEUD_LIVE_VALIDATION_VIEWER_EMAIL?.trim() ??
    process.env.NEUD_LIVE_VALIDATION_OWNER_EMAIL?.trim() ??
    null;
  const viewerPassword =
    process.env.NEUD_LIVE_VALIDATION_VIEWER_PASSWORD?.trim() ??
    process.env.NEUD_LIVE_VALIDATION_OWNER_PASSWORD?.trim() ??
    null;

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
  const anonClient = createAnonClient(url, publishableKey);
  const admin = serviceRoleKey
    ? createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  let projectId = null;
  if (admin) {
    const { data: project } = await admin
      .from("projects")
      .select("id")
      .eq("slug", PROJECT_SLUG)
      .maybeSingle();
    projectId = project?.id ?? null;
  }

  const cloudPublishing = await loadCloudPublishingContext(admin, projectId);
  const leaseSummary = summarizeLeaseRow(
    admin && projectId
      ? (
          await admin
            .from("project_publisher_leases")
            .select("*")
            .eq("project_id", projectId)
            .maybeSingle()
        ).data
      : null,
  );

  const enrichSummary = (summary) =>
    cloudPublishing
      ? {
          ...summary,
          leasePresent: cloudPublishing.leasePresent,
          leaseExpired: cloudPublishing.leaseExpired,
          lastHeartbeatAgeSeconds: cloudPublishing.lastHeartbeatAgeSeconds,
          snapshotPresent: cloudPublishing.snapshotPresent,
          snapshotAgeSeconds: cloudPublishing.snapshotAgeSeconds,
        }
      : summary;

  const displayResults = {};
  for (const displaySlug of ACTIVE_BROAD_ARROW_DISPLAY_SLUGS) {
    const anonResult = await anonClient.rpc("get_online_display_viewer_bundle", {
      p_project_slug: PROJECT_SLUG,
      p_display_slug: displaySlug,
    });
    displayResults[displaySlug] = enrichSummary(
      summarizeRpcCall({
        data: anonResult.data,
        error: anonResult.error,
        sessionAvailable: false,
        membershipAccess: "anonymous",
      }),
    );
  }

  const streamBidSummary = displayResults["stream-bid-display"] ?? null;

  let authenticatedSummary = null;
  let authenticatedUserId = null;

  if (viewerEmail && viewerPassword) {
    const authClient = await signInClient(url, publishableKey, viewerEmail, viewerPassword);
    const {
      data: { user },
    } = await authClient.auth.getUser();
    authenticatedUserId = user?.id ?? null;

    const authResult = await authClient.rpc("get_online_display_viewer_bundle", {
      p_project_slug: PROJECT_SLUG,
      p_display_slug: "stream-bid-display",
    });

    const membershipAccess = await resolveMembershipAccess(
      admin,
      projectId,
      authenticatedUserId,
    );

    authenticatedSummary = enrichSummary(
      summarizeRpcCall({
        data: authResult.data,
        error: authResult.error,
        sessionAvailable: Boolean(authenticatedUserId),
        membershipAccess,
      }),
    );
  }

  const summary = {
    targetRef,
    projectSlug: PROJECT_SLUG,
    displaySlug: "stream-bid-display",
    migration026Applied: migrationFlags.migration026Applied,
    migration027Applied: migrationFlags.migration027Applied,
    migration028Applied: migrationFlags.migration028Applied,
    authenticatedSessionConfigured: Boolean(viewerEmail && viewerPassword),
    displays: displayResults,
    anonymous: streamBidSummary,
    authenticated: authenticatedSummary,
    authUidPresent: authenticatedSummary?.sessionAvailable ?? false,
    membershipCheckPassed: authenticatedSummary?.membershipAccess === "granted",
    publisherConnection: buildAlignedConnectionSection({
      authenticatedCloudSessionAvailable: authenticatedSummary?.sessionAvailable ?? false,
      hasRestorableCloudSession: null,
      publishingManagerRunning: null,
      heartbeatTimerActive: null,
      localDesktopInstanceId: null,
      activePublisherInstanceId: leaseSummary.leasePublisherInstanceId,
      leasePublisherInstanceId: leaseSummary.leasePublisherInstanceId,
      publisherLeaseExists: leaseSummary.publisherLeaseExists,
      leaseExpired: leaseSummary.leaseExpired,
      lastHeartbeatAgeSeconds: leaseSummary.lastHeartbeatAgeSeconds,
      projectPublishingEnabled: null,
      eligibleOnlineViewerDisplays: null,
      onlineViewerEnabled: true,
      viewerPublisherOnline: streamBidSummary?.publisherOnline ?? null,
    }),
    invocationNotes: [
      "Anonymous call uses the publishable key without a user session.",
      "Authenticated call requires NEUD_LIVE_VALIDATION_VIEWER_EMAIL and NEUD_LIVE_VALIDATION_VIEWER_PASSWORD (or OWNER_* equivalents) in .env.live-validation.local.",
      "Apply migration 026_fix_viewer_bundle_rpc.sql to preview before expecting viewer_ready.",
      "Apply migration 027_viewer_bundle_publisher_heartbeat.sql for heartbeat-based stale logic.",
      "Apply migration 028_viewer_status_semantics.sql so unchanged snapshot age does not mark data stale.",
      "Snapshot age in diagnostics is informational only; publisher heartbeat drives Source Offline.",
    ],
  };

  const outputPath = path.join(repoRoot, "docs", "broad-arrow-viewer-diagnostic.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
