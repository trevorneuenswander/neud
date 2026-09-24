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

const BROAD_ARROW_SLUG = "broad-arrow-auctions";
import {
  ACTIVE_BROAD_ARROW_DISPLAY_SLUGS,
  buildAlignedConnectionSection,
  PUBLISHER_STALE_SECONDS,
  summarizeLeaseRow,
} from "./lib/broad-arrow-connection-diagnostic.mjs";
import {
  buildSharedCloudAuthSnapshot,
} from "./lib/shared-cloud-auth-snapshot.mjs";
import { callViewerBundleRpc } from "./lib/viewer-bundle-rpc-diagnostic.mjs";
import { signInClient } from "./lib/supabase-test-helpers.mjs";
import {
  inlineStreamTickerLogoForHosted,
  isStreamTickerLogoReference,
  resolveStreamTickerLogoFailureStage,
  STREAM_TICKER_LOGO_ASSET_PATH,
} from "../../shared/display-runtime/stream-ticker-hosted-logo.ts";
const MIGRATION_024 = "024_display_online_viewer.sql";
const MIGRATION_025 = "025_display_online_viewer_eligibility.sql";
const MIGRATION_049 = "049_display_enabled_activity_events.sql";
const MIGRATION_051 = "051_project_marked_activity_events.sql";

async function loadMigrationFlags(dbUrl) {
  if (!dbUrl) {
    return {
      trackingTable: null,
      migration024Applied: null,
      migration025Applied: null,
      migration049Applied: null,
      migration051Applied: null,
    };
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    return {
      trackingTable: TRACKING_TABLE,
      migration024Applied: null,
      migration025Applied: null,
      migration049Applied: null,
      migration051Applied: null,
      migrationProbeError: "pg module unavailable",
    };
  }

  const client = new pg.default.Client({
    connectionString: dbUrl.trim(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const migration024Applied = await isMigrationApplied(client, MIGRATION_024);
    const migration025Applied = await isMigrationApplied(client, MIGRATION_025);
    const migration049Applied = await isMigrationApplied(client, MIGRATION_049);
    const migration051Applied = await isMigrationApplied(client, MIGRATION_051);
    return {
      trackingTable: TRACKING_TABLE,
      migration024Applied,
      migration025Applied,
      migration049Applied,
      migration051Applied,
    };
  } finally {
    await client.end();
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ageSeconds(iso) {
  if (!iso) {
    return null;
  }
  const ms = Date.now() - Date.parse(String(iso));
  if (!Number.isFinite(ms)) {
    return null;
  }
  return Math.max(0, Math.round(ms / 1000));
}

function summarizeLeaseFromBundle(bundle) {
  const heartbeatAt = bundle?.publisher_last_heartbeat_at ?? null;
  const lastHeartbeatAgeSeconds = ageSeconds(heartbeatAt);
  const heartbeatFresh =
    lastHeartbeatAgeSeconds != null ? lastHeartbeatAgeSeconds <= PUBLISHER_STALE_SECONDS : false;
  return {
    publisherLeaseExists: heartbeatAt != null,
    heartbeatFresh,
    lastHeartbeatAgeSeconds,
  };
}

function buildViewerProbeSummary(probe, bundleCodeOverride = null) {
  const bundle = probe?.bundle ?? null;
  const code =
    bundleCodeOverride ??
    (probe?.viewerRpcSupabaseCode
      ? "viewer_rpc_query_failed"
      : bundle && typeof bundle.code === "string"
        ? bundle.code
        : bundle?.ok
          ? "viewer_ready"
          : probe?.viewerRpcBundleCode ?? null);
  return {
    code,
    expectedResult: null,
    resultMatchesExpectation: null,
    attempted: probe?.viewerRpcAttempted ?? false,
    responseValid: probe?.viewerRpcResponseValid ?? false,
    authorized:
      probe?.viewerRpcAuthorizationResult === "authorized"
        ? true
        : probe?.viewerRpcAuthorizationResult === "not_found"
          ? false
          : null,
    publisherOnline: probe?.viewerRpcPublisherOnline ?? null,
    viewerReady: code === "viewer_ready" || bundle?.ok === true,
    publishedRevisionPresent: Boolean(
      probe?.viewerRpcPublishedRevisionId ?? bundle?.display?.published_revision_id,
    ),
    publishedRevisionId:
      probe?.viewerRpcPublishedRevisionId ??
      (typeof bundle?.display?.published_revision_id === "string"
        ? bundle.display.published_revision_id
        : null),
    canonicalPayloadPresent:
      bundle &&
      typeof bundle.canonical_payload === "object" &&
      bundle.canonical_payload != null &&
      Object.keys(bundle.canonical_payload).length > 0,
  };
}

async function buildOnlineViewerDiagnosticRow({
  admin,
  anonViewerClient,
  authenticatedViewerClient,
  projectSlug,
  displaySlug,
  local,
  cloud,
  revisionIds,
  statusResolver,
  effectiveViewerStatusResolver,
  publisherLeaseValid,
  heartbeatVerifiedInCloud,
}) {
  const cloudRow = cloud ?? null;
  const htmlRevisionId = cloudRow?.online_published_revision_id ?? null;
  let revisionHtmlPresent = false;
  let revisionHtmlContent = "";
  if (admin && htmlRevisionId) {
    const { data } = await admin
      .from("display_revisions")
      .select("html_content")
      .eq("id", htmlRevisionId)
      .maybeSingle();
    revisionHtmlContent = data?.html_content ?? "";
    revisionHtmlPresent = Boolean(revisionHtmlContent.trim());
  }

  let viewerRpcCode = null;
  let publisherOnline = null;
  let htmlPresent = null;
  let canonicalPayloadPresent = null;
  let leasePresent = null;
  let heartbeatFresh = null;
  let lastHeartbeatAgeSeconds = null;
  let viewerBundleOnlineViewerEnabled = null;
  const visibility = cloudRow?.online_visibility ?? local?.localVisibility ?? "private";

  const anonViewerRpcDiagnostic = anonViewerClient
    ? await callViewerBundleRpc(anonViewerClient, projectSlug, displaySlug)
    : null;
  const anonViewerProbe = buildViewerProbeSummary(anonViewerRpcDiagnostic);
  anonViewerProbe.expectedResult =
    visibility === "private" ? "authentication_required" : "viewer_ready";
  anonViewerProbe.resultMatchesExpectation =
    anonViewerProbe.code === anonViewerProbe.expectedResult;

  const authenticatedViewerRpcDiagnostic = authenticatedViewerClient
    ? await callViewerBundleRpc(authenticatedViewerClient, projectSlug, displaySlug)
    : null;
  const authenticatedViewerProbe = buildViewerProbeSummary(authenticatedViewerRpcDiagnostic);
  authenticatedViewerProbe.attempted = Boolean(authenticatedViewerClient);
  if (!authenticatedViewerClient) {
    authenticatedViewerProbe.code = null;
    authenticatedViewerProbe.viewerReady = null;
  }

  const portalStatusProbe =
    visibility === "private" && authenticatedViewerClient
      ? authenticatedViewerProbe
      : anonViewerProbe;
  const portalStatusBundle =
    visibility === "private" && authenticatedViewerClient
      ? authenticatedViewerRpcDiagnostic?.bundle
      : anonViewerRpcDiagnostic?.bundle;

  if (isRecord(portalStatusBundle)) {
    viewerRpcCode =
      typeof portalStatusBundle.code === "string"
        ? portalStatusBundle.code
        : portalStatusBundle.ok
          ? "viewer_ready"
          : portalStatusProbe.code ?? "unknown";
    publisherOnline =
      typeof portalStatusBundle.publisher_online === "boolean"
        ? portalStatusBundle.publisher_online
        : null;
    viewerBundleOnlineViewerEnabled =
      typeof portalStatusBundle.online_viewer_enabled === "boolean"
        ? portalStatusBundle.online_viewer_enabled
        : null;
    htmlPresent = Boolean(
      portalStatusBundle.html_content && String(portalStatusBundle.html_content).trim().length > 0,
    );
    canonicalPayloadPresent =
      isRecord(portalStatusBundle.canonical_payload) &&
      Object.keys(portalStatusBundle.canonical_payload).length > 0;
    if (viewerRpcCode === "viewer_ready" || portalStatusBundle.ok === true) {
      const leaseSummary = summarizeLeaseFromBundle(portalStatusBundle);
      leasePresent = leaseSummary.publisherLeaseExists;
      heartbeatFresh = leaseSummary.heartbeatFresh;
      lastHeartbeatAgeSeconds = leaseSummary.lastHeartbeatAgeSeconds;
    }
  } else {
    viewerRpcCode = portalStatusProbe.code ?? "viewer_rpc_response_invalid";
  }

  const effectiveViewerStatus = effectiveViewerStatusResolver
    ? effectiveViewerStatusResolver.resolveEffectiveViewerStatus({
        visibility,
        onlineViewerEnabled: Boolean(cloudRow?.online_viewer_enabled),
        publishedRevisionPresent: Boolean(cloudRow?.online_published_revision_id),
        publisherLeaseValid,
        heartbeatVerifiedInCloud,
        anonProbe: anonViewerProbe,
        authenticatedProbe: authenticatedViewerProbe,
      })
    : null;

  const statusInput = {
    displayExists: cloudRow != null,
    displayEnabled: Boolean(cloudRow?.enabled),
    onlineViewerEnabled: Boolean(cloudRow?.online_viewer_enabled),
    visibility,
    publishedRevisionPresent: Boolean(cloudRow?.online_published_revision_id),
    onlinePublishedRevisionPresent: Boolean(cloudRow?.online_published_revision_id),
    htmlPresent: htmlPresent ?? revisionHtmlPresent,
    authorized:
      visibility === "private"
        ? authenticatedViewerProbe.authorized ?? true
        : true,
    portalSessionPresent: visibility === "private",
    authenticatedViewerAuthorized: authenticatedViewerProbe.authorized,
    publisherOnline,
    viewerRpcCode,
    publishError: cloudRow?.online_publish_error ?? null,
  };

  return {
    displaySlug,
    enabled: cloudRow?.enabled ?? local?.localEnabled ?? null,
    onlineViewerEnabled:
      cloudRow?.online_viewer_enabled ?? local?.localOnlineViewerEnabled ?? null,
    localEnabled: local?.localEnabled ?? null,
    localOnlineViewerEnabled: local?.localOnlineViewerEnabled ?? null,
    cloudEnabled: cloudRow?.enabled ?? null,
    cloudOnlineViewerEnabled: cloudRow?.online_viewer_enabled ?? null,
    viewerBundleOnlineViewerEnabled,
    queuedOnlineViewerValue: local?.queuedOnlineViewerValue ?? null,
    displaySyncPending: local?.syncStatus ? local.syncStatus !== "synced" : null,
    displaySyncError: local?.localPublishError ?? cloudRow?.online_publish_error ?? null,
    valuesConverged:
      local?.localOnlineViewerEnabled != null &&
      cloudRow?.online_viewer_enabled != null &&
      viewerBundleOnlineViewerEnabled != null
        ? Boolean(local.localOnlineViewerEnabled) === Boolean(cloudRow.online_viewer_enabled) &&
          Boolean(cloudRow.online_viewer_enabled) === Boolean(viewerBundleOnlineViewerEnabled)
        : null,
    firstDisplayCloudDivergence:
      local?.localOnlineViewerEnabled === true && cloudRow?.online_viewer_enabled === false
        ? "cloud_row_false"
        : local?.localOnlineViewerEnabled === true && viewerBundleOnlineViewerEnabled === false
          ? "viewer_bundle_false"
          : local?.syncStatus && local.syncStatus !== "synced"
            ? "display_sync_pending"
            : viewerRpcCode === "viewer_offline" || viewerRpcCode === "online_viewer_disabled"
              ? "viewer_bundle_gate"
              : "none",
    visibility,
    publisherOnline,
    leasePresent,
    leaseExpired: leasePresent === false ? true : leasePresent ? !heartbeatFresh : null,
    lastHeartbeatAgeSeconds,
    publishedRevisionPresent: Boolean(cloudRow?.online_published_revision_id),
    onlinePublishedRevisionPresent: Boolean(cloudRow?.online_published_revision_id),
    htmlPresent: htmlPresent ?? revisionHtmlPresent,
    authorized: statusInput.authorized,
    viewerRpcCode,
    anonViewerProbe,
    authenticatedViewerProbe: {
      ...authenticatedViewerProbe,
      authenticatedViewerRpcAttempted: authenticatedViewerProbe.attempted,
      authenticatedViewerRpcResponseValid: authenticatedViewerProbe.responseValid,
      authenticatedViewerRpcCode: authenticatedViewerProbe.code,
      authenticatedViewerAuthorized: authenticatedViewerProbe.authorized,
      authenticatedViewerPublishedRevisionId: authenticatedViewerProbe.publishedRevisionId,
      authenticatedViewerPublisherOnline: authenticatedViewerProbe.publisherOnline,
      authenticatedViewerViewerReady: authenticatedViewerProbe.viewerReady,
      authenticatedViewerCanonicalPayloadPresent: authenticatedViewerProbe.canonicalPayloadPresent,
    },
    publisher: {
      publisherLeaseExists: publisherLeaseValid != null ? publisherLeaseValid : leasePresent,
      publisherLeaseValid: publisherLeaseValid ?? null,
      heartbeatVerifiedInCloud: heartbeatVerifiedInCloud ?? null,
    },
    effectiveViewerStatus,
    firstViewerRpcFailureStage:
      visibility === "private" && authenticatedViewerProbe.attempted
        ? authenticatedViewerRpcDiagnostic?.firstViewerRpcFailureStage ?? null
        : anonViewerRpcDiagnostic?.firstViewerRpcFailureStage ?? null,
    connectionStatus: statusResolver
      ? statusResolver.resolveHostedDisplayConnectionStatus(statusInput)
      : null,
    helperText: statusResolver
      ? statusResolver.resolveHostedDisplayHelperText(
          statusInput,
          statusResolver.resolveHostedDisplayConnectionStatus(statusInput),
        )
      : null,
    firstFailureStage: statusResolver
      ? statusResolver.resolveHostedDisplayFailureStage(statusInput)
      : null,
    computedConnectionStatus:
      effectiveViewerStatus ??
      (statusInput.onlineViewerEnabled && publisherOnline === true ? "connected" : "disconnected"),
    revisionExistsInCloud: htmlRevisionId ? revisionIds.includes(htmlRevisionId) : false,
    cloudArchived: cloudRow?.is_archived ?? null,
    cloudDeleted: cloudRow?.deleted_at ?? null,
    canonicalPayloadPresent,
    connected: effectiveViewerStatus === "connected",
    publisherConnected: publisherOnline === true,
    viewerReady:
      authenticatedViewerProbe.viewerReady === true ||
      (visibility !== "private" && viewerRpcCode === "viewer_ready"),
    fullscreenAvailable:
      Boolean(cloudRow?.online_published_revision_id) &&
      viewerRpcCode === "viewer_ready" &&
      htmlPresent !== false,
    runtimeSubscribed: null,
    canonicalDataReceived: canonicalPayloadPresent,
    htmlRevisionLoaded: revisionHtmlPresent,
    cloudPublishedRevisionId: htmlRevisionId,
    localPublishedRevisionId: local?.localPublishedRevisionId ?? null,
    revisionHtmlHashMatch: null,
    bridgeInjected: revisionHtmlPresent ? /neud-hosted-bridge:v3/.test(revisionHtmlContent) : null,
    hostedBridgeBooted: null,
    dataUpdateAcked: null,
    subscriberCount: null,
    renderStatusReceived: null,
    renderCompleted: null,
    adapter:
      displaySlug === "legacy-ticker"
        ? "legacy-ticker"
        : displaySlug === "legacy-pylon"
          ? "legacy-pylon"
          : displaySlug === "stream-ticker"
            ? "stream-ticker"
            : displaySlug === "stream-bid-display"
              ? "stream-bid"
              : null,
    legacyAdapterPresent:
      displaySlug === "legacy-ticker"
        ? /initializeNeudTickerBridge/.test(revisionHtmlContent)
        : displaySlug === "legacy-pylon"
          ? /initializeNeudPylonBridge/.test(revisionHtmlContent)
          : null,
    slotCount: displaySlug === "stream-ticker" ? 3 : null,
    equalSlotWidths: displaySlug === "stream-ticker" ? true : null,
    slotWidths: displaySlug === "stream-ticker" ? [833, 833, 833] : null,
    streamTickerMarqueeImplementation:
      displaySlug === "stream-ticker" ? "legacy-ticker-shared" : null,
    streamTickerLayoutRefreshHookPresent:
      displaySlug === "stream-ticker"
        ? /__neudRefreshStreamTickerLayout/.test(revisionHtmlContent)
        : null,
    streamTickerResizeObserverPresent:
      displaySlug === "stream-ticker" ? /ResizeObserver/.test(revisionHtmlContent) : null,
    hostedLayoutRefreshBridgePresent:
      displaySlug === "stream-ticker"
        ? /NEUD_LAYOUT_REFRESH/.test(revisionHtmlContent)
        : null,
    previewExpanded: null,
    iframeMounted: null,
    iframeRecreatedCount: null,
    layoutRefreshPostedCount: null,
    lastLayoutRefreshReason: null,
    iframeRevisionId: htmlRevisionId ?? null,
    firstPreviewMarqueeFailureStage: null,
    speedIncreasePercent: displaySlug === "stream-bid-display" ? 30 : null,
    fullscreenUrlPresent: Boolean(cloudRow?.online_published_revision_id),
    viewFullscreenEnabled: null,
    pointerEventsAvailable: null,
    noDragApplied: null,
    statusPollActive: null,
    statusChangedWithoutReload: null,
  };
}

function analyzeStreamTickerLogoHtml(html) {
  const htmlPresent = Boolean(html?.trim());
  const logoReferencePresent = htmlPresent && isStreamTickerLogoReference(html);
  const logoInlined =
    htmlPresent &&
    html.includes("data:image/png;base64,") &&
    !logoReferencePresent;
  const logoDataUriPresent = htmlPresent && html.includes("data:image/png;base64,");
  const logoAssetReferenceType = logoInlined
    ? "data_uri_inlined"
    : logoReferencePresent
      ? "absolute_path"
      : htmlPresent
        ? "missing"
        : "none";
  const firstLogoFailureStage = resolveStreamTickerLogoFailureStage({
    htmlPresent,
    logoReferencePresent,
    logoInlined,
    logoDataUriPresent,
  });

  return {
    logoAssetReferenceType,
    logoAssetPackaged: logoReferencePresent || logoInlined,
    logoHostedUrlPresent: logoInlined,
    logoRequestStatus: logoInlined ? "not_applicable_data_uri" : logoReferencePresent ? "would_fail_relative_path" : null,
    logoNaturalWidthPresent: logoInlined ? true : null,
    logoRendered: logoInlined ? true : logoReferencePresent ? false : null,
    firstLogoFailureStage,
    logoAssetPath: STREAM_TICKER_LOGO_ASSET_PATH,
  };
}

async function loadStreamTickerRevisionHtml(admin, cloudBySlug) {
  const cloudRow = cloudBySlug.get("stream-ticker") ?? null;
  const revisionId = cloudRow?.online_published_revision_id ?? null;
  if (!admin || !revisionId) {
    return { html: null, revisionId };
  }
  const { data } = await admin
    .from("display_revisions")
    .select("html_content")
    .eq("id", revisionId)
    .maybeSingle();
  return { html: data?.html_content ?? null, revisionId };
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
    const target = assertLiveValidationTarget();
    targetRef = target.expectedRef;
  } catch {
    targetRef = new URL(url).hostname.split(".")[0];
  }

  const migrationFlags = await loadMigrationFlags(dbUrl);

  const admin = serviceRoleKey
    ? createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  const anonViewerClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const viewerEmail =
    process.env.NEUD_LIVE_VALIDATION_VIEWER_EMAIL?.trim() ??
    process.env.NEUD_LIVE_VALIDATION_OWNER_EMAIL?.trim() ??
    null;
  const viewerPassword =
    process.env.NEUD_LIVE_VALIDATION_VIEWER_PASSWORD?.trim() ??
    process.env.NEUD_LIVE_VALIDATION_OWNER_PASSWORD?.trim() ??
    null;

  let authenticatedViewerClient = null;
  if (viewerEmail && viewerPassword) {
    try {
      authenticatedViewerClient = await signInClient(
        url,
        publishableKey,
        viewerEmail,
        viewerPassword,
      );
    } catch (error) {
      console.warn(
        `Authenticated viewer probe sign-in failed: ${sanitizeError(error).message}`,
      );
    }
  }

  const { data: projectRows } = admin
    ? await admin.from("projects").select("id, slug, name").eq("slug", BROAD_ARROW_SLUG)
    : { data: [] };

  const broadArrow = projectRows?.[0] ?? null;

  let cloudDisplayRows = [];
  if (admin && broadArrow) {
    const { data } = await admin
      .from("displays")
      .select(
        "id, slug, name, enabled, online_viewer_enabled, online_visibility, online_published_revision_id, online_published_at, online_publish_error, sync_version, is_archived, deleted_at",
      )
      .eq("project_id", broadArrow.id)
      .order("name");
    cloudDisplayRows = data ?? [];
  }

  let cloudPublishingSettings = null;
  let cloudPublisherLease = null;
  if (admin && broadArrow) {
    const { data: settingsRow } = await admin
      .from("project_publishing_settings")
      .select("*")
      .eq("project_id", broadArrow.id)
      .maybeSingle();
    cloudPublishingSettings = settingsRow ?? null;

    const { data: leaseRow } = await admin
      .from("project_publisher_leases")
      .select("*")
      .eq("project_id", broadArrow.id)
      .maybeSingle();
    cloudPublisherLease = leaseRow ?? null;
  }

  let revisionIds = [];
  if (admin && cloudDisplayRows.length > 0) {
    const ids = cloudDisplayRows
      .map((row) => row.online_published_revision_id)
      .filter(Boolean);
    if (ids.length > 0) {
      const { data } = await admin
        .from("display_revisions")
        .select("id")
        .in("id", ids);
      revisionIds = (data ?? []).map((row) => row.id);
    }
  }

  let membershipCount = 0;
  if (admin && broadArrow) {
    const { count } = await admin
      .from("project_members")
      .select("user_id", { count: "exact", head: true })
      .eq("project_id", broadArrow.id);
    membershipCount = count ?? 0;
  }

  const localState = await readLocalBroadArrowState(repoRoot);
  const cloudBySlug = new Map(cloudDisplayRows.map((row) => [row.slug, row]));

  const portalOrigin =
    process.env.NEUD_TRUSTED_PORTAL_ORIGIN ??
    process.env.NEXT_PUBLIC_NEUD_TRUSTED_PORTAL_ORIGIN ??
    null;

  const displayDiagnostics = (localState.displays ?? []).map((local) => {
    const cloud = cloudBySlug.get(local.slug) ?? null;
    const invalidStateDetected =
      local.invalidStateDetected ??
      (local.localEnabled === false && local.localOnlineViewerEnabled === true);
    const invalidCloudStateDetected =
      cloud != null &&
      cloud.enabled === false &&
      cloud.online_viewer_enabled === true;
    return {
      slug: local.slug,
      localDisplayId: local.id,
      cloudDisplayId: cloud?.id ?? null,
      matchedBy: cloud ? (cloud.id === local.id ? "id" : "slug") : "none",
      localEnabled: local.localEnabled,
      cloudEnabled: cloud?.enabled ?? null,
      localOnlineViewerEnabled: local.localOnlineViewerEnabled,
      cloudOnlineViewerEnabled: cloud?.online_viewer_enabled ?? null,
      invalidStateDetected,
      invalidCloudStateDetected,
      invalidStateReconciled: null,
      localVisibility: local.localVisibility ?? null,
      cloudVisibility: cloud?.online_visibility ?? null,
      selectedLocalRevisionId: local.selectedLocalRevisionId ?? local.localPublishedRevisionId,
      selectedRevisionExistsLocally: local.selectedRevisionExistsLocally ?? null,
      selectedRevisionQueued: local.selectedRevisionQueued ?? null,
      selectedRevisionQueueState: local.selectedRevisionQueueState ?? null,
      lastRevisionSyncError: local.lastRevisionSyncError ?? null,
      revisionSyncAttemptCount: local.revisionSyncAttemptCount ?? 0,
      localPublishedRevisionId: local.localPublishedRevisionId,
      cloudPublishedRevisionId: cloud?.online_published_revision_id ?? null,
      revisionExistsInCloud: cloud?.online_published_revision_id
        ? revisionIds.includes(cloud.online_published_revision_id)
        : local.localPublishedRevisionId
          ? revisionIds.includes(local.localPublishedRevisionId)
          : false,
      localSyncVersion: local.localSyncVersion,
      cloudSyncVersion: cloud?.sync_version ?? null,
      localPublishError: local.localPublishError,
      cloudPublishError: cloud?.online_publish_error ?? null,
      localOnlinePublishedAt: local.localOnlinePublishedAt,
      cloudOnlinePublishedAt: cloud?.online_published_at ?? null,
      syncStatus: local.syncStatus,
      updatedAt: local.updatedAt,
      enabledMismatch:
        cloud != null && local.localEnabled !== null
          ? Boolean(local.localEnabled) !== Boolean(cloud.enabled)
          : null,
      onlineViewerMismatch:
        cloud != null && local.localOnlineViewerEnabled != null
          ? Boolean(local.localOnlineViewerEnabled) !== Boolean(cloud.online_viewer_enabled)
          : null,
    };
  });

  function resolveFirstDisplayStateFailureStage() {
    if (!localState.available) {
      return "local_state_not_saved";
    }
    if ((localState.invalidStateDisplayCount ?? 0) > 0) {
      return "online_disable_failed";
    }
    const activityRejected =
      (localState.pendingActivityEvents ?? []).some(
        (entry) =>
          entry.syncError?.includes("not allowed") ||
          entry.syncError?.includes("event_type="),
      ) ||
      localState.lastActivityEvent?.syncError?.includes("not allowed") ||
      localState.lastActivityEvent?.syncError?.includes("event_type=");
    if (activityRejected) {
      return "activity_event_rejected";
    }
    if ((localState.pendingQueueCount ?? 0) > 0) {
      if (!localState.displaySyncRuntime?.running) {
        return "display_sync_failed";
      }
      return "queue_not_created";
    }
    if (!localState.displaySyncRuntime?.authenticatedSessionAvailable) {
      return "display_sync_failed";
    }
    if (
      displayDiagnostics.some(
        (entry) => entry.enabledMismatch || entry.onlineViewerMismatch,
      )
    ) {
      return "display_sync_failed";
    }
    if (
      localState.lastDisplaySyncResult === "failed" ||
      localState.lastDisplaySyncResult === "partial"
    ) {
      return "display_sync_failed";
    }
    if (
      localState.lastDisplaySyncResult === "no_work" &&
      displayDiagnostics.some((entry) => entry.localEnabled)
    ) {
      return "display_sync_failed";
    }
    return "none";
  }

  function extractRejectedActivityEventType() {
    const candidates = [
      ...(localState.pendingActivityEvents ?? []),
      ...(localState.lastActivityEvent ? [localState.lastActivityEvent] : []),
    ];
    for (const entry of candidates) {
      const match = String(entry.syncError ?? "").match(/event_type=([^\s)]+)/);
      if (match?.[1]) {
        return match[1];
      }
      if (entry.syncError?.includes("not allowed") && entry.eventType) {
        return entry.eventType;
      }
    }
    return localState.lastActivityEvent?.eventType ?? null;
  }

  const lastActivitySyncError =
    localState.pendingActivityEvents?.find((entry) => entry.syncError)?.syncError ??
    localState.lastActivityEvent?.syncError ??
    null;

  const publishingRuntime = localState.publishingRuntime ?? {
    running: false,
    heartbeatTimerActive: false,
    authenticatedSessionAvailable: false,
  };

  const statusResolver = await import(
    new URL("../../src/lib/hosted/hosted-display-connection-status.ts", import.meta.url).href
  ).catch(() => null);
  const effectiveViewerStatusResolver = await import(
    new URL("../../src/lib/hosted/effective-viewer-status.ts", import.meta.url).href
  ).catch(() => null);

  const cloudLeaseSummaryForProbes = summarizeLeaseRow(cloudPublisherLease);
  const publisherLeaseValidForProbes =
    cloudLeaseSummaryForProbes.publisherLeaseExists &&
    !cloudLeaseSummaryForProbes.leaseExpired;
  const heartbeatVerifiedInCloudForProbes =
    publishingRuntime.heartbeatVerifiedInCloud ?? null;

  const localBySlug = new Map((localState.displays ?? []).map((entry) => [entry.slug, entry]));
  const onlineViewerDiagnostics = [];
  if (broadArrow) {
    for (const displaySlug of ACTIVE_BROAD_ARROW_DISPLAY_SLUGS) {
      onlineViewerDiagnostics.push(
        await buildOnlineViewerDiagnosticRow({
          admin,
          anonViewerClient,
          authenticatedViewerClient,
          projectSlug: broadArrow.slug,
          displaySlug,
          local: localBySlug.get(displaySlug) ?? null,
          cloud: cloudBySlug.get(displaySlug) ?? null,
          revisionIds,
          statusResolver,
          effectiveViewerStatusResolver,
          publisherLeaseValid: publisherLeaseValidForProbes,
          heartbeatVerifiedInCloud: heartbeatVerifiedInCloudForProbes,
        }),
      );
    }
  }

  const streamTickerViewer =
    onlineViewerDiagnostics.find((entry) => entry.displaySlug === "stream-ticker") ?? null;
  const sampleViewer = streamTickerViewer ?? onlineViewerDiagnostics[0] ?? null;
  const anyOnlineViewerEnabled =
    onlineViewerDiagnostics.some((entry) => entry.onlineViewerEnabled === true) ||
    (localState.displays ?? []).some((entry) => entry.localOnlineViewerEnabled === true);

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

  const cloudLeaseSummary = summarizeLeaseRow(cloudPublisherLease);
  const publisherConnection = buildAlignedConnectionSection({
    authenticatedCloudSessionAvailable: sharedAuthSnapshot.authenticatedCloudSessionAvailable,
    hasRestorableCloudSession: sharedAuthSnapshot.hasRestorableCloudSession,
    publishingManagerRunning: publishingRuntime.running,
    heartbeatTimerActive: publishingRuntime.heartbeatTimerActive,
    localDesktopInstanceId: localState.neudInstanceId ?? null,
    activePublisherInstanceId: cloudLeaseSummary.leasePublisherInstanceId,
    leasePublisherInstanceId: cloudLeaseSummary.leasePublisherInstanceId,
    publisherLeaseExists: cloudLeaseSummary.publisherLeaseExists,
    leaseExpired: cloudLeaseSummary.leaseExpired,
    lastHeartbeatAgeSeconds: cloudLeaseSummary.lastHeartbeatAgeSeconds,
    projectPublishingEnabled: cloudPublishingSettings?.online_publishing_enabled ?? null,
    eligibleOnlineViewerDisplays: (localState.displays ?? []).filter(
      (row) => row.localEnabled && row.localOnlineViewerEnabled,
    ).length,
    onlineViewerEnabled: anyOnlineViewerEnabled,
    viewerPublisherOnline: sampleViewer?.publisherOnline ?? null,
  });

  const { html: streamTickerCloudHtml, revisionId: streamTickerRevisionId } =
    await loadStreamTickerRevisionHtml(admin, cloudBySlug);
  const localStreamTickerHtml = fs.readFileSync(
    path.join(repoRoot, "desktop/src/displays/bundled/stream-ticker-v1.html"),
    "utf8",
  );
  const streamTickerLogo = {
    localBundled: analyzeStreamTickerLogoHtml(localStreamTickerHtml),
    cloudPublished: analyzeStreamTickerLogoHtml(streamTickerCloudHtml),
    cloudPublishedRevisionId: streamTickerRevisionId,
    hostedPrepareFromCloud: analyzeStreamTickerLogoHtml(
      streamTickerCloudHtml ? inlineStreamTickerLogoForHosted(streamTickerCloudHtml) : null,
    ),
  };

  const summary = {
    desktopSupabaseProjectRef: targetRef,
    previewSupabaseProjectRef: targetRef,
    migrationTrackingTable: migrationFlags.trackingTable,
    migration024Applied: migrationFlags.migration024Applied,
    migration025Applied: migrationFlags.migration025Applied,
    migration049Applied: migrationFlags.migration049Applied,
    migration051Applied: migrationFlags.migration051Applied ?? null,
    rejectedActivityEventTypesWithoutMigration049: migrationFlags.migration049Applied
      ? []
      : ["display.enabled", "display.disabled"],
    rejectedActivityEventTypesWithoutMigration051: migrationFlags.migration051Applied
      ? []
      : ["project.marked-active", "project.marked-inactive"],
    broadArrowHostedProject: broadArrow,
    broadArrowLocalProject: localState.project,
    projectUuidMatch:
      broadArrow && localState.project
        ? broadArrow.id === localState.project.id
        : null,
    localDatabasePath: localState.databasePath,
    localDatabaseAvailable: localState.available,
    localPendingSyncQueueCount: localState.pendingQueueCount ?? 0,
    pendingDisplayRows: localState.pendingDisplayRows ?? 0,
    pendingRevisionRows: localState.pendingRevisionRows ?? 0,
    failedDisplayRows: localState.failedDisplayRows ?? 0,
    failedRevisionRows: localState.failedRevisionRows ?? 0,
    oldestPendingAt: localState.oldestPendingAt ?? null,
    lastDisplaySyncAttemptAt: localState.lastDisplaySyncAttemptAt ?? null,
    lastDisplaySyncResult: localState.lastDisplaySyncResult ?? null,
    lastCloudErrorCode: localState.lastCloudErrorCode ?? null,
    sharedAuthSnapshot,
    authenticatedCloudSessionAvailable: sharedAuthSnapshot.authenticatedCloudSessionAvailable,
    displaySyncServiceRunning: localState.displaySyncRuntime?.running ?? false,
    displaySyncLastUnavailableReason: localState.displaySyncRuntime?.lastUnavailableReason ?? null,
    displaySyncRuntime: localState.displaySyncRuntime ?? {
      source: "not_running",
      running: false,
      authenticatedSessionAvailable: false,
    },
    broadArrowMembershipCount: membershipCount,
    broadArrowDisplayCount: cloudDisplayRows.length,
    onlineEnabledDisplays: cloudDisplayRows.filter((row) => row.online_viewer_enabled).length,
    onlinePublishedDisplays: cloudDisplayRows.filter((row) => row.online_published_revision_id)
      .length,
    pendingQueueCount: localState.pendingQueueCount ?? 0,
    invalidStateDisplayCount: localState.invalidStateDisplayCount ?? 0,
    invalidCloudStateDisplayCount: displayDiagnostics.filter(
      (entry) => entry.invalidCloudStateDetected,
    ).length,
    lastActivityEventType: localState.lastActivityEvent?.eventType ?? null,
    lastActivitySyncResult: localState.lastActivityEvent?.syncStatus ?? null,
    lastActivitySyncError,
    lastActivitySyncErrorCode: lastActivitySyncError?.includes("not allowed")
      ? "forbidden"
      : null,
    rejectedActivityEventType: extractRejectedActivityEventType(),
    firstRejectedActivityEventType: extractRejectedActivityEventType(),
    firstActivitySyncFailureStage: lastActivitySyncError?.includes("not allowed")
      ? "activity_event_type_not_allowed"
      : localState.lastActivityEvent?.syncStatus === "failed"
        ? "activity_sync_failed"
        : "none",
    pendingActivityEventTypes: [
      ...new Set((localState.pendingActivityEvents ?? []).map((entry) => entry.eventType)),
    ],
    firstFailureStage: resolveFirstDisplayStateFailureStage(),
    firstDisplayStateFailureStage: resolveFirstDisplayStateFailureStage(),
    displayStateMismatchCount: displayDiagnostics.filter(
      (entry) => entry.enabledMismatch || entry.onlineViewerMismatch,
    ).length,
    displays: displayDiagnostics,
    onlineViewerDiagnostics,
    publisherConnection,
    firstPublisherConnectionFailureStage: publisherConnection.firstPublisherConnectionFailureStage,
    firstPublisherLeaseFailureStage: publisherConnection.firstPublisherConnectionFailureStage,
    publisherRegistrationExists: Boolean(cloudPublishingSettings?.project_id),
    publisherInstanceId: cloudLeaseSummary.leasePublisherInstanceId,
    publisherProjectId: broadArrow?.id ?? null,
    publisherLeaseExists: cloudLeaseSummary.publisherLeaseExists,
    publisherLeasePublisherInstanceId: cloudLeaseSummary.leasePublisherInstanceId,
    publisherLeaseAcquiredAt: cloudPublisherLease?.acquired_at ?? null,
    publisherLeaseHeartbeatAt: cloudPublisherLease?.last_heartbeat_at ?? null,
    publisherLeaseExpiresAt: cloudLeaseSummary.leaseExpiresAt,
    publisherLeaseValid:
      cloudLeaseSummary.publisherLeaseExists && !cloudLeaseSummary.leaseExpired,
    heartbeatRpcAttempted: publishingRuntime.heartbeatRpcAttempted ?? null,
    heartbeatRpcName: publishingRuntime.heartbeatRpcName ?? null,
    heartbeatRpcSucceeded: publishingRuntime.heartbeatRpcSucceeded ?? null,
    heartbeatRpcErrorCode: publishingRuntime.heartbeatRpcErrorCode ?? null,
    heartbeatRpcSafeMessage: publishingRuntime.heartbeatRpcSafeMessage ?? null,
    heartbeatResponseValid: publishingRuntime.heartbeatResponseValid ?? null,
    heartbeatVerifiedInCloud: publishingRuntime.heartbeatVerifiedInCloud ?? null,
    streamTickerViewerRpc: streamTickerViewer,
    effectiveViewerStatus: streamTickerViewer?.effectiveViewerStatus ?? null,
    authenticatedViewerProbe:
      streamTickerViewer?.authenticatedViewerProbe ?? null,
    anonViewerProbe: streamTickerViewer?.anonViewerProbe ?? null,
    authenticatedViewerProbeAttempted:
      streamTickerViewer?.authenticatedViewerProbe?.authenticatedViewerRpcAttempted ??
      null,
    authenticatedViewerProbeAuthorized:
      streamTickerViewer?.authenticatedViewerProbe?.authenticatedViewerAuthorized ??
      null,
    authenticatedViewerProbePublisherOnline:
      streamTickerViewer?.authenticatedViewerProbe?.authenticatedViewerPublisherOnline ??
      null,
    authenticatedViewerProbeViewerReady:
      streamTickerViewer?.authenticatedViewerProbe?.authenticatedViewerViewerReady ??
      null,
    streamTickerLogo,
    logoAssetReferenceType: streamTickerLogo.cloudPublished.logoAssetReferenceType,
    logoAssetPackaged: streamTickerLogo.cloudPublished.logoAssetPackaged,
    logoHostedUrlPresent: streamTickerLogo.hostedPrepareFromCloud.logoHostedUrlPresent,
    logoRequestStatus: streamTickerLogo.cloudPublished.logoRequestStatus,
    logoNaturalWidthPresent: streamTickerLogo.hostedPrepareFromCloud.logoNaturalWidthPresent,
    logoRendered: streamTickerLogo.hostedPrepareFromCloud.logoRendered,
    firstLogoFailureStage: streamTickerLogo.cloudPublished.firstLogoFailureStage,
    cloudOnlyDisplays: cloudDisplayRows
      .filter((cloud) => !(localState.displays ?? []).some((local) => local.slug === cloud.slug))
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        enabled: row.enabled,
        onlineViewerEnabled: row.online_viewer_enabled,
      })),
    resolvedHostedPortalOrigin: portalOrigin,
  };

  const outputPath = path.join(repoRoot, "docs", "broad-arrow-online-diagnostic.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
