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
import { readLocalBroadArrowState } from "./lib/local-neud-db.mjs";
import { isMigrationApplied, TRACKING_TABLE } from "./lib/migrations.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

const PROJECT_SLUG = "broad-arrow-auctions";
const MIGRATION_027 = "027_viewer_bundle_publisher_heartbeat.sql";
import {
  buildAlignedConnectionSection,
  summarizeLeaseRow,
  PUBLISHER_STALE_SECONDS,
} from "./lib/broad-arrow-connection-diagnostic.mjs";
import {
  buildSharedCloudAuthSnapshot,
  resolveAuthenticatedCloudSessionAvailable,
} from "./lib/shared-cloud-auth-snapshot.mjs";

function parseSetting(settings, key) {
  const raw = settings?.get?.(key);
  if (raw == null) {
    return null;
  }
  try {
    return JSON.parse(String(raw));
  } catch {
    return String(raw);
  }
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

async function loadMigration027Flag(dbUrl) {
  if (!dbUrl) {
    return { trackingTable: TRACKING_TABLE, migration027Applied: null };
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    return {
      trackingTable: TRACKING_TABLE,
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
      migration027Applied: await isMigrationApplied(client, MIGRATION_027),
    };
  } finally {
    await client.end();
  }
}

async function readLocalPublishingHints(repoRoot, projectId) {
  const databasePath = path.join(
    process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming"),
    "NEUD",
    "data",
    "neud.sqlite",
  );
  const configured = process.env.NEUD_LOCAL_DATABASE_PATH?.trim();
  const resolvedPath = configured ?? databasePath;

  if (!fs.existsSync(resolvedPath)) {
    return { localDatabasePath: resolvedPath, available: false };
  }

  let initSqlJs;
  try {
    initSqlJs = (await import("sql.js")).default;
  } catch {
    return { localDatabasePath: resolvedPath, available: false, reason: "sql.js unavailable" };
  }

  const wasmCandidates = [
    path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(repoRoot, "desktop", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  ];
  const wasmPath = wasmCandidates.find((candidate) => fs.existsSync(candidate));
  if (!wasmPath) {
    return { localDatabasePath: resolvedPath, available: false, reason: "wasm missing" };
  }

  const SQL = await initSqlJs({
    locateFile: (fileName) =>
      fileName === "sql-wasm.wasm" ? wasmPath : path.join(path.dirname(wasmPath), fileName),
  });
  const db = new SQL.Database(fs.readFileSync(resolvedPath));
  const settingsRows = db.exec(`SELECT key, value_json FROM app_settings`);
  const settings = new Map(
    (settingsRows[0]?.values ?? []).map((row) => [String(row[0]), row[1]]),
  );

  const instanceId = parseSetting(settings, "neud.instanceId");
  const publishingEnabled = parseSetting(settings, `publishing.project.${projectId}.enabledCache`);
  const lastPublishedHash = parseSetting(
    settings,
    `publishing.project.${projectId}.lastPublishedHash`,
  );
  const lastPublishedRevision = parseSetting(
    settings,
    `publishing.project.${projectId}.lastPublishedRevision`,
  );
  const lastSuccessfulPublishAt = parseSetting(
    settings,
    `publishing.project.${projectId}.lastSuccessfulPublishAt`,
  );
  const pipelineDiagnostics = parseSetting(
    settings,
    `canonical.pipeline.project.${projectId}`,
  );
  const canonicalPublishDiagnostics = parseSetting(
    settings,
    `publishing.project.${projectId}.canonicalPublishDiagnostics`,
  );
  const displayDataSource = parseSetting(settings, "displayDataSource");

  db.close();

  return {
    localDatabasePath: resolvedPath,
    available: true,
    localDesktopInstanceId: instanceId,
    localPublishingEnabledCache: publishingEnabled,
    localLastPublishedHash: lastPublishedHash,
    localLastPublishedRevision: lastPublishedRevision,
    localLastSuccessfulPublishAt: lastSuccessfulPublishAt,
    displayDataSource,
    pipelineDiagnostics,
    canonicalPublishDiagnostics,
  };
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  loadLiveValidationEnv(repoRoot);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const dbUrl = process.env.NEUD_SUPABASE_DB_URL?.trim() ?? null;

  if (!url) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL.");
    process.exit(1);
  }

  let targetRef = "unknown";
  try {
    targetRef = assertLiveValidationTarget().expectedRef;
  } catch {
    targetRef = new URL(url).hostname.split(".")[0];
  }

  const migrationFlags = await loadMigration027Flag(dbUrl);
  const localState = await readLocalBroadArrowState(repoRoot);
  const localProjectId = localState.project?.id ?? null;

  const admin = serviceRoleKey
    ? createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  let hostedProject = null;
  let publishingSettings = null;
  let lease = null;
  let snapshot = null;

  if (admin) {
    const { data: project } = await admin
      .from("projects")
      .select("id, slug, name")
      .eq("slug", PROJECT_SLUG)
      .maybeSingle();
    hostedProject = project ?? null;

    if (hostedProject) {
      const { data: settings } = await admin
        .from("project_publishing_settings")
        .select("*")
        .eq("project_id", hostedProject.id)
        .maybeSingle();
      publishingSettings = settings ?? null;

      const { data: leaseRow } = await admin
        .from("project_publisher_leases")
        .select("*")
        .eq("project_id", hostedProject.id)
        .maybeSingle();
      lease = leaseRow ?? null;

      const { data: snapshotRow } = await admin
        .from("project_canonical_snapshots")
        .select("*")
        .eq("project_id", hostedProject.id)
        .order("revision", { ascending: false })
        .limit(1)
        .maybeSingle();
      snapshot = snapshotRow ?? null;
    }
  }

  const localHints = localProjectId
    ? await readLocalPublishingHints(repoRoot, localProjectId)
    : { available: false };

  const now = Date.now();
  const leaseSummary = summarizeLeaseRow(lease, now);
  const lastHeartbeatAgeSeconds = leaseSummary.lastHeartbeatAgeSeconds;
  const snapshotAgeSeconds = ageSeconds(snapshot?.received_at ?? snapshot?.updated_at);

  const payloadData = snapshot?.payload?.data ?? null;
  const payloadDataKeys =
    payloadData && typeof payloadData === "object" && !Array.isArray(payloadData)
      ? Object.keys(payloadData)
      : [];

  const publishingRuntime = localState.publishingRuntime ?? {
    initialized: false,
    running: false,
    authenticatedSessionAvailable: false,
    heartbeatTimerActive: false,
    lastHeartbeatAttemptAt: null,
    lastHeartbeatSuccessAt: null,
    lastHeartbeatErrorCode: null,
    lastStartReason: null,
    lastStopReason: null,
    updatedAt: null,
    source: "not_running",
  };

  const sharedAuthSnapshot = buildSharedCloudAuthSnapshot(localState.sharedCloudAuth, {
    hasRestorableCloudSession:
      localState.sharedCloudAuth?.persistedSessionPresent ??
      localState.sharedCloudAuth?.refreshTokenPresent ??
      false,
    hasCloudSession: Boolean(
      localState.sharedCloudAuth?.accessTokenPresent &&
        localState.sharedCloudAuth?.refreshTokenPresent &&
        !localState.sharedCloudAuth?.reauthenticationRequired,
    ),
  });

  const summary = {
    targetRef,
    projectSlug: PROJECT_SLUG,
    migration027Applied: migrationFlags.migration027Applied,
    localProjectUuid: localProjectId,
    hostedProjectUuid: hostedProject?.id ?? null,
    projectUuidMatch:
      localProjectId && hostedProject ? localProjectId === hostedProject.id : null,
    sharedAuthSnapshot,
    authenticatedCloudSessionAvailable: sharedAuthSnapshot.authenticatedCloudSessionAvailable,
    hasRestorableCloudSession: sharedAuthSnapshot.hasRestorableCloudSession,
    sharedCloudAuth: localState.sharedCloudAuth ?? null,
    persistedSessionPresent: localState.sharedCloudAuth?.persistedSessionPresent ?? null,
    tokenExpired: localState.sharedCloudAuth?.tokenExpired ?? null,
    lastRefreshResult: localState.sharedCloudAuth?.lastRefreshResult ?? null,
    lastRefreshErrorCode: localState.sharedCloudAuth?.lastRefreshErrorCode ?? null,
    authenticatedClientReady: localState.sharedCloudAuth?.authenticatedClientReady ?? null,
    reauthenticationRequired: localState.sharedCloudAuth?.reauthenticationRequired ?? null,
    firstSharedCloudFailureStage: localState.sharedCloudAuth?.firstSharedCloudFailureStage ?? null,
    publishingManagerInitialized: publishingRuntime.initialized,
    publishingManagerRunning: publishingRuntime.running,
    heartbeatTimerActive: publishingRuntime.heartbeatTimerActive,
    publishingManagerLastHeartbeatAttemptAt: publishingRuntime.lastHeartbeatAttemptAt,
    publishingManagerLastHeartbeatSuccessAt: publishingRuntime.lastHeartbeatSuccessAt,
    publishingManagerLastHeartbeatErrorCode: publishingRuntime.lastHeartbeatErrorCode,
    publishingManagerLastStartReason: publishingRuntime.lastStartReason,
    publishingManagerLastStopReason: publishingRuntime.lastStopReason,
    publishingRuntimeSource: publishingRuntime.source,
    projectPublishingEnabled: publishingSettings?.online_publishing_enabled ?? null,
    activePublisherInstanceId: lease?.publisher_instance_id ?? null,
    localDesktopInstanceId: localHints.localDesktopInstanceId ?? null,
    publisherLeaseExists: leaseSummary.publisherLeaseExists,
    leasePublisherInstanceId: leaseSummary.leasePublisherInstanceId,
    leaseAcquiredAt: lease?.acquired_at ?? null,
    lastHeartbeatAt: leaseSummary.lastHeartbeatAt,
    lastHeartbeatAgeSeconds,
    leaseExpiresAt: leaseSummary.leaseExpiresAt,
    leaseExpired: leaseSummary.leaseExpired,
    heartbeatFresh: leaseSummary.heartbeatFresh,
    latestCanonicalSnapshotExists: Boolean(snapshot),
    canonicalRevision: snapshot?.revision ?? null,
    generatedAt: snapshot?.generated_at ?? null,
    receivedAt: snapshot?.received_at ?? null,
    snapshotAgeSeconds,
    sourceMode: snapshot?.source_mode ?? null,
    sourceConnected: snapshot?.source_connected ?? null,
    payloadDataPresent: Boolean(payloadData),
    payloadDataTopLevelKeys: payloadDataKeys,
    latestPublishResult: publishingSettings?.last_publish_result ?? null,
    lastPublishError: publishingSettings?.last_publish_error ?? null,
    lastSuccessfulPublishAt: publishingSettings?.last_successful_publish_at ?? null,
    localCurrentCanonicalRevision:
      localHints.pipelineDiagnostics?.localCanonicalRevision ??
      localHints.localLastPublishedRevision ??
      null,
    localCurrentDigest:
      localHints.pipelineDiagnostics?.localCanonicalDigestPrefix ??
      localHints.localLastPublishedHash ??
      null,
    cloudCanonicalRevision: snapshot?.revision ?? null,
    cloudPayloadHash: snapshot?.payload_hash ?? null,
    latestCloudSnapshotReceivedAt: snapshot?.received_at ?? null,
    selectedDataSource: localHints.displayDataSource ?? null,
    canonicalSourceUsed: localHints.pipelineDiagnostics?.canonicalSourceUsed ?? null,
    lastCanonicalInputChangedAt:
      localHints.pipelineDiagnostics?.lastCanonicalInputChangedAt ?? null,
    lastCanonicalRegeneratedAt:
      localHints.pipelineDiagnostics?.lastCanonicalRegeneratedAt ?? null,
    lastCanonicalDigestChangedAt:
      localHints.pipelineDiagnostics?.lastCanonicalDigestChangedAt ?? null,
    lastControllerChangeAt: localHints.pipelineDiagnostics?.lastControllerChangeAt ?? null,
    lastScraperChangeAt: localHints.pipelineDiagnostics?.lastScraperChangeAt ?? null,
    lastChangedStructuralGroups:
      localHints.pipelineDiagnostics?.lastChangedStructuralGroups ?? [],
    lastMeaningfulChangeAt:
      localHints.pipelineDiagnostics?.lastCanonicalDigestChangedAt ??
      localHints.pipelineDiagnostics?.lastCanonicalInputChangedAt ??
      null,
    lastPublicationTriggerReason:
      localHints.pipelineDiagnostics?.lastCanonicalPublicationTriggerReason ??
      localHints.canonicalPublishDiagnostics?.lastCanonicalPublishReason ??
      null,
    lastSnapshotPublicationResult:
      localHints.canonicalPublishDiagnostics?.lastCanonicalPublicationResult ??
      publishingSettings?.last_publish_result ??
      null,
    lastSnapshotPublicationAttemptAt:
      localHints.canonicalPublishDiagnostics?.lastCanonicalPublicationAttemptAt ??
      publishingSettings?.last_publish_attempt_at ??
      null,
    localSnapshotPublicationSuccessAt: localHints.localLastSuccessfulPublishAt ?? null,
    cloudProjectPublishingLastSuccessAt: publishingSettings?.last_successful_publish_at ?? null,
    localLeaseHeartbeatSuccessAt: publishingRuntime.lastHeartbeatSuccessAt ?? null,
    lastCanonicalPublicationRequestedAt:
      localHints.canonicalPublishDiagnostics?.lastCanonicalPublishRequestedAt ?? null,
    lastCanonicalNoChangeAt:
      localHints.canonicalPublishDiagnostics?.lastCanonicalNoChangeAt ?? null,
    lastOnlineViewerReconcileAt:
      localHints.pipelineDiagnostics?.lastOnlineViewerReconcileAt ?? null,
    canonicalHashesMatch:
      localHints.localLastPublishedHash && snapshot?.payload_hash
        ? localHints.localLastPublishedHash === snapshot.payload_hash
        : null,
    viewerStaleThresholdSeconds: PUBLISHER_STALE_SECONDS,
    snapshotAgeInformationalOnly: true,
    eligibleOnlineViewerDisplays: (localState.displays ?? []).filter(
      (row) => row.localEnabled && row.localOnlineViewerEnabled,
    ).length,
    localPublishingEnabledCache: localHints.localPublishingEnabledCache ?? null,
    localLastPublishedRevision: localHints.localLastPublishedRevision ?? null,
    localLastSuccessfulPublishAt: localHints.localLastSuccessfulPublishAt ?? null,
    notes: [
      "Run NEUD Desktop with an authenticated cloud session for live manager state.",
      "Payload contents, credentials, and tokens are intentionally excluded.",
      "Apply migration 028 before expecting source metadata refresh on duplicate unchanged hash.",
    ],
  };

  summary.publisherConnection = buildAlignedConnectionSection({
    authenticatedCloudSessionAvailable: summary.authenticatedCloudSessionAvailable,
    hasRestorableCloudSession: summary.hasRestorableCloudSession,
    publishingManagerRunning: summary.publishingManagerRunning,
    heartbeatTimerActive: summary.heartbeatTimerActive,
    localDesktopInstanceId: summary.localDesktopInstanceId,
    activePublisherInstanceId: summary.activePublisherInstanceId,
    leasePublisherInstanceId: summary.leasePublisherInstanceId,
    publisherLeaseExists: summary.publisherLeaseExists,
    leaseExpired: summary.leaseExpired,
    lastHeartbeatAgeSeconds: summary.lastHeartbeatAgeSeconds,
    projectPublishingEnabled: summary.projectPublishingEnabled,
    eligibleOnlineViewerDisplays: summary.eligibleOnlineViewerDisplays,
    onlineViewerEnabled: summary.eligibleOnlineViewerDisplays > 0,
    viewerPublisherOnline:
      summary.publisherLeaseExists &&
      !summary.leaseExpired &&
      summary.lastHeartbeatAgeSeconds != null &&
      summary.lastHeartbeatAgeSeconds <= PUBLISHER_STALE_SECONDS
        ? true
        : summary.publisherLeaseExists
          ? false
          : null,
    lastHeartbeatErrorCode: summary.publishingManagerLastHeartbeatErrorCode,
  });

  summary.firstPublisherConnectionFailureStage =
    summary.publisherConnection.firstPublisherConnectionFailureStage;
  summary.computedConnectionStatus = summary.publisherConnection.computedConnectionStatus;

  const outputPath = path.join(repoRoot, "docs", "broad-arrow-publishing-diagnostic.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
