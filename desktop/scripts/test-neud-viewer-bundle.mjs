#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const viewerBundlePath = pathToFileURL(
  path.join(repoRoot, "src/lib/hosted/viewer-bundle.ts"),
).href;

const {
  categorizeRpcError,
  parseViewerBundleRpcResult,
  resolveViewerLoadErrorMessage,
  resolveViewerRevisionKey,
  summarizeViewerBundleDiagnostic,
} = await import(viewerBundlePath);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const readyBundle = {
  ok: true,
  code: "viewer_ready",
  project: { id: "proj-1", slug: "broad-arrow-auctions", name: "Broad Arrow" },
  display: {
    id: "disp-1",
    slug: "stream-bid-display",
    name: "Stream Bid Display",
    published_revision_id: "rev-1",
    refresh_rate_ms: 5000,
    online_visibility: "private",
  },
  html_content: "<html><body>display</body></html>",
  canonical_payload: { auctionDisplay: { lot: 1 } },
  canonical_revision: 12,
  published_at: "2026-07-21T12:00:00.000Z",
  stale: false,
  source_offline: false,
};

test("parseViewerBundleRpcResult accepts snake_case viewer_ready bundle", () => {
  const parsed = parseViewerBundleRpcResult(readyBundle);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.code, "viewer_ready");
  assert.equal(parsed.htmlContent.includes("display"), true);
  assert.equal(parsed.revisionKey, "rev-1");
  assert.equal(parsed.canonicalRevision, 12);
  assert.deepEqual(parsed.canonicalPayload, { auctionDisplay: { lot: 1 } });
});

test("parseViewerBundleRpcResult loads HTML when canonical payload is null", () => {
  const parsed = parseViewerBundleRpcResult({
    ...readyBundle,
    canonical_payload: null,
    canonical_revision: null,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.canonicalPayload, null);
  assert.equal(parsed.htmlContent.length > 0, true);
});

test("parseViewerBundleRpcResult maps missing HTML to not_published", () => {
  const parsed = parseViewerBundleRpcResult({
    ...readyBundle,
    html_content: "   ",
  });
  assert.equal(parsed.ok, false);
  if (parsed.ok) {
    return;
  }
  assert.equal(parsed.code, "not_published");
  assert.match(parsed.message, /not been published/i);
});

test("parseViewerBundleRpcResult maps RPC errors to temporary_cloud_error", () => {
  const parsed = parseViewerBundleRpcResult(null, {
    code: "PGRST116",
    message: 'column "expires_at" does not exist',
  });
  assert.equal(parsed.ok, false);
  if (parsed.ok) {
    return;
  }
  assert.equal(parsed.code, "temporary_cloud_error");
});

test("parseViewerBundleRpcResult maps authentication_required code", () => {
  const parsed = parseViewerBundleRpcResult({ ok: false, code: "authentication_required" });
  assert.equal(parsed.ok, false);
  if (parsed.ok) {
    return;
  }
  assert.equal(parsed.code, "authentication_required");
  assert.match(parsed.message, /Sign in/i);
});

test("resolveViewerRevisionKey falls back to published_at and html length", () => {
  assert.equal(
    resolveViewerRevisionKey({
      display: { published_revision_id: "rev-abc" },
    }),
    "rev-abc",
  );
  assert.equal(
    resolveViewerRevisionKey({
      display: {},
      published_at: "2026-07-21T12:00:00.000Z",
      html_content: "<html></html>",
    }),
    "published_at:2026-07-21T12:00:00.000Z",
  );
  assert.equal(
    resolveViewerRevisionKey({
      display: {},
      html_content: "<html></html>",
    }),
    "html:13",
  );
});

test("summarizeViewerBundleDiagnostic reports safe fields only", () => {
  const summary = summarizeViewerBundleDiagnostic({
    rpcData: readyBundle,
    sessionAvailable: true,
    membershipAccess: "granted",
  });
  assert.equal(summary.rpcSuccess, true);
  assert.equal(summary.htmlPresent, true);
  assert.equal(summary.htmlLength, readyBundle.html_content.length);
  assert.equal(summary.canonicalPayloadPresent, true);
  assert.equal(summary.publishedRevisionId, "rev-1");
  assert.equal(summary.membershipAccess, "granted");
  assert.equal(JSON.stringify(summary).includes("<html>"), false);
});

test("resolveViewerLoadErrorMessage covers specific viewer states", () => {
  assert.match(resolveViewerLoadErrorMessage("authentication_required"), /Sign in/i);
  assert.match(resolveViewerLoadErrorMessage("not_found"), /unavailable/i);
  assert.match(resolveViewerLoadErrorMessage("invalid_bundle"), /invalid/i);
  assert.match(resolveViewerLoadErrorMessage("temporary_cloud_error"), /temporarily unavailable/i);
});

test("categorizeRpcError detects auth failures", () => {
  assert.equal(categorizeRpcError({ code: "401", message: "JWT expired" }), "authentication_required");
});

test("private viewer route redirects anonymous users to login with next", () => {
  const privatePage = read("src/app/portal/projects/[slug]/displays/[displaySlug]/page.tsx");
  assert.match(privatePage, /redirect\(`\/login\?next=/);
  assert.match(privatePage, /get_online_display_viewer_bundle/);
  assert.match(privatePage, /logViewerBundleDiagnostic/);
});

test("hosted viewer client uses viewer bundle parser and login redirect", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.match(client, /parseViewerBundleRpcResult/);
  assert.match(client, /\/login\?next=/);
  assert.match(client, /srcDoc=\{preparedHtml\}/);
  assert.match(client, /HOSTED_VIEWER_PARSER_VERSION/);
  assert.match(client, /resolveViewerStatusNotice/);
  assert.match(client, /statusNotice\.title/);
});

test("migration 027 uses lease heartbeat for source offline and keeps render-only data", () => {
  const migration = read("supabase/migrations/027_viewer_bundle_publisher_heartbeat.sql");
  const sqlBody = migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.match(sqlBody, /last_heartbeat_at/);
  assert.match(sqlBody, /lease_expires_at/);
  assert.match(sqlBody, /v_publisher_stale_seconds integer := 45/);
  assert.match(sqlBody, /'publisher_online'/);
  assert.match(sqlBody, /'source_connected'/);
  assert.match(sqlBody, /'stale_reason'/);
  assert.match(sqlBody, /v_snapshot\.payload -> 'data'/);
  assert.doesNotMatch(sqlBody, /last_successful_publish_at > interval '45 seconds'/);
});

test("viewer bundle parser exposes publisher heartbeat fields", () => {
  const parsed = parseViewerBundleRpcResult({
    ...readyBundle,
    publisher_online: true,
    source_connected: true,
    source_mode: "local-controller",
    data_stale: false,
    stale_reason: null,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.publisherOnline, true);
  assert.equal(parsed.sourceConnected, true);
  assert.equal(parsed.sourceMode, "local-controller");
});

test("hosted viewer distinguishes source offline from data stale", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  const status = read("src/lib/hosted/viewer-status.ts");
  assert.match(client, /sourceOffline: bundle\.sourceOffline/);
  assert.match(client, /dataStale: bundle\.dataStale/);
  assert.match(client, /resolveViewerStatusNotice/);
  assert.match(status, /source_offline/);
  assert.match(status, /data_stale/);
});

test("migration 028 supersedes snapshot-age stale warnings in viewer bundle RPC", () => {
  const migration = read("supabase/migrations/028_viewer_status_semantics.sql");
  assert.match(migration, /028_viewer_status_semantics/);
  assert.doesNotMatch(migration, /interval '5 minutes'/);
});

test("diagnose broad arrow viewer script reports lease and snapshot ages", () => {
  const script = read("scripts/live-validation/diagnose-broad-arrow-viewer.mjs");
  assert.match(script, /leasePresent/);
  assert.match(script, /lastHeartbeatAgeSeconds/);
  assert.match(script, /snapshotAgeSeconds/);
  assert.match(script, /staleReason/);
});

test("diagnose broad arrow publishing script reports safe publishing state", () => {
  const script = read("scripts/live-validation/diagnose-broad-arrow-publishing.mjs");
  assert.match(script, /publisherLeaseExists/);
  assert.match(script, /payloadDataTopLevelKeys/);
  assert.match(script, /viewerStaleThresholdSeconds/);
  assert.doesNotMatch(script, /console\.log[\s\S]*payload\.data/);
});

test("migration 026 fixes lease_expires_at and restores published_revision_id", () => {
  const migration = read("supabase/migrations/026_fix_viewer_bundle_rpc.sql");
  const sqlBody = migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.match(sqlBody, /lease_expires_at/);
  assert.doesNotMatch(sqlBody, /v_lease\.expires_at/);
  assert.match(sqlBody, /'published_revision_id', v_display\.online_published_revision_id/);
  assert.match(sqlBody, /'authentication_required'/);
  assert.match(sqlBody, /'canonical_revision'/);
});

test("diagnose broad arrow viewer script calls viewer bundle RPC safely", () => {
  const script = read("scripts/live-validation/diagnose-broad-arrow-viewer.mjs");
  assert.match(script, /get_online_display_viewer_bundle/);
  assert.match(script, /stream-bid-display/);
  assert.match(script, /htmlLength/);
  assert.match(script, /htmlPresent/);
  assert.doesNotMatch(script, /console\.log[\s\S]*html_content/);
});
