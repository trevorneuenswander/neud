#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const connectionStatusPath = pathToFileURL(
  path.join(repoRoot, "src/lib/hosted/hosted-display-connection-status.ts"),
).href;

const {
  resolveHostedDisplayHelperText,
  resolveHostedDisplayStatus,
  resolvePortalConnected,
} = await import(connectionStatusPath);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const publishedEligible = {
  displayExists: true,
  displayEnabled: true,
  onlineViewerEnabled: true,
  visibility: "private",
  publishedRevisionPresent: true,
  onlinePublishedRevisionPresent: true,
  authorized: true,
};

test("connected only when online viewer on and publisher online", () => {
  assert.equal(
    resolvePortalConnected({ onlineViewerEnabled: true, publisherOnline: true }),
    true,
  );
  assert.equal(
    resolvePortalConnected({ onlineViewerEnabled: true, publisherOnline: false }),
    false,
  );
  assert.equal(
    resolvePortalConnected({ onlineViewerEnabled: false, publisherOnline: true }),
    false,
  );
  const status = resolveHostedDisplayStatus({
    ...publishedEligible,
    publisherOnline: true,
    viewerRpcCode: "viewer_ready",
    htmlPresent: true,
  });
  assert.equal(status.connectivityLabel, "Connected");
  assert.equal(status.connectivityTone, "success");
  assert.equal(status.portalConnected, true);
  assert.equal(status.helperText, null);
});

test("online viewer off always produces disconnected", () => {
  const status = resolveHostedDisplayStatus({
    ...publishedEligible,
    onlineViewerEnabled: false,
    publisherOnline: true,
  });
  assert.equal(status.connectivityLabel, "Disconnected");
  assert.equal(status.connectivityTone, "danger");
  assert.equal(status.portalConnected, false);
  assert.match(status.helperText, /Turn on Online Viewer/);
});

test("publisher offline always produces disconnected", () => {
  const status = resolveHostedDisplayStatus({
    ...publishedEligible,
    publisherOnline: false,
    viewerRpcCode: "viewer_ready",
    htmlPresent: true,
  });
  assert.equal(status.connectivityLabel, "Disconnected");
  assert.equal(status.connectivityTone, "danger");
  assert.match(status.helperText, /No active desktop publisher/);
});

test("online viewer off shows configuration helper not publisher helper", () => {
  const helper = resolveHostedDisplayHelperText(
    { ...publishedEligible, onlineViewerEnabled: false, publisherOnline: false },
    "viewer_off",
  );
  assert.match(helper, /Turn on Online Viewer/);
  assert.doesNotMatch(helper ?? "", /No active desktop publisher/);
});

test("separate online viewer pill is absent from hosted card", () => {
  const card = read("src/components/hosted/HostedDisplayCard.tsx");
  assert.doesNotMatch(card, /Online Viewer:/);
  assert.match(card, /Private|Public/);
});

test("private/public pill remains on hosted card", () => {
  const card = read("src/components/hosted/HostedDisplayCard.tsx");
  assert.match(card, /visibility === "public" \? "Public" : "Private"/);
});

test("publisher offline with published revision keeps viewer actions available", () => {
  const status = resolveHostedDisplayStatus({
    ...publishedEligible,
    publisherOnline: false,
    viewerRpcCode: "viewer_ready",
    htmlPresent: true,
  });
  assert.equal(status.canOpenViewer, true);
  assert.equal(status.canCopyUrl, true);
});

test("online viewer off disables viewer actions", () => {
  const status = resolveHostedDisplayStatus({
    ...publishedEligible,
    onlineViewerEnabled: false,
    publisherOnline: true,
    viewerRpcCode: "viewer_ready",
    htmlPresent: true,
  });
  assert.equal(status.canOpenViewer, false);
  assert.equal(status.canCopyUrl, false);
});

test("bundle poll preserves last good publisher state on refresh issue", () => {
  const hook = read("src/lib/hosted/use-hosted-display-bundle-status.ts");
  assert.match(hook, /lastGoodRef/);
  assert.match(hook, /refreshIssue/);
  assert.doesNotMatch(hook, /publisherOnline: hasLoadedBundleRef\.current \? false/);
});

test("publishing manager starts with restorable cloud session", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  const main = read("desktop/src/main.ts");
  assert.match(manager, /cloud\.hasRestorableCloudSession/);
  assert.match(main, /hasPersistedTokens/);
});

test("diagnostics expose aligned publisher connection section", () => {
  const publishing = read("scripts/live-validation/diagnose-broad-arrow-publishing.mjs");
  const online = read("scripts/live-validation/diagnose-broad-arrow-online.mjs");
  const shared = read("scripts/live-validation/lib/broad-arrow-connection-diagnostic.mjs");
  assert.match(publishing, /firstPublisherConnectionFailureStage/);
  assert.match(publishing, /publisherConnection/);
  assert.match(online, /publisherConnection/);
  assert.match(online, /computedConnectionStatus/);
  assert.match(shared, /buildAlignedConnectionSection/);
});

test("migration heartbeat threshold matches desktop stale seconds", () => {
  const migration = read("supabase/migrations/028_viewer_status_semantics.sql");
  const types = read("desktop/src/services/publishing/types.ts");
  assert.match(migration, /v_publisher_stale_seconds integer := 45/);
  assert.match(types, /PUBLISHING_HEARTBEAT_STALE_SECONDS = 45/);
});

test("version remains 0.1.0", () => {
  assert.equal(JSON.parse(read("package.json")).version, "0.1.0");
});
