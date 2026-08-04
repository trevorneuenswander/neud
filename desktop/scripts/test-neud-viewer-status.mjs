#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const viewerStatusPath = pathToFileURL(
  path.join(repoRoot, "src/lib/hosted/viewer-status.ts"),
).href;

const { isExplicitDataStale, resolveViewerStatusNotice } = await import(viewerStatusPath);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const baseInput = {
  sourceOffline: false,
  publisherOnline: true,
  sourceConnected: true,
  sourceMode: "webpage-scraper",
  dataStale: false,
  staleReason: null,
  canonicalDataPresent: true,
  hasResolvedCanonicalSnapshot: true,
};

test("fresh heartbeat with old unchanged snapshot shows no stale warning", () => {
  const notice = resolveViewerStatusNotice({
    ...baseInput,
    dataStale: false,
    staleReason: null,
  });
  assert.equal(notice, null);
  assert.equal(isExplicitDataStale("snapshot_age"), false);
});

test("fresh heartbeat with scraper disconnected shows concise scraper notice", () => {
  const notice = resolveViewerStatusNotice({
    ...baseInput,
    sourceConnected: false,
    sourceMode: "webpage-scraper",
  });
  assert.ok(notice);
  assert.equal(notice.kind, "scraper_disconnected");
  assert.match(notice.title, /Webpage Scraper Disconnected/i);
  assert.match(notice.message, /latest available data/i);
});

test("local controller active with valid data shows no disconnected warning", () => {
  const notice = resolveViewerStatusNotice({
    ...baseInput,
    sourceMode: "local-controller",
    sourceConnected: true,
  });
  assert.equal(notice, null);
});

test("expired heartbeat shows source offline banner", () => {
  const notice = resolveViewerStatusNotice({
    ...baseInput,
    sourceOffline: true,
    publisherOnline: false,
  });
  assert.ok(notice);
  assert.equal(notice.kind, "source_offline");
  assert.match(notice.title, /Source Offline/i);
});

test("no canonical data shows waiting for data banner", () => {
  const notice = resolveViewerStatusNotice({
    ...baseInput,
    canonicalDataPresent: false,
    hasResolvedCanonicalSnapshot: false,
  });
  assert.ok(notice);
  assert.equal(notice.kind, "waiting_for_data");
  assert.match(notice.title, /Waiting for Data/i);
});

test("explicit stale marker allows data stale warning", () => {
  const notice = resolveViewerStatusNotice({
    ...baseInput,
    dataStale: true,
    staleReason: "explicit_payload_marker",
  });
  assert.ok(notice);
  assert.equal(notice.kind, "data_stale");
});

test("migration 028 removes snapshot-age stale logic and adds canonical_data_present", () => {
  const migration = read("supabase/migrations/028_viewer_status_semantics.sql");
  const sqlBody = migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.match(sqlBody, /'canonical_data_present'/);
  assert.match(sqlBody, /'snapshot_received_at'/);
  assert.match(sqlBody, /'publisher_last_heartbeat_at'/);
  assert.doesNotMatch(sqlBody, /interval '5 minutes'/);
  assert.doesNotMatch(sqlBody, /snapshot_age/);
});

test("migration 028 refreshes source metadata on duplicate unchanged hash", () => {
  const migration = read("supabase/migrations/028_viewer_status_semantics.sql");
  assert.match(migration, /source_mode is distinct from p_source_mode/);
  assert.match(migration, /source_connected is distinct from coalesce\(p_source_connected, false\)/);
});

test("hosted viewer client uses unified status notice helper", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.match(client, /resolveViewerStatusNotice/);
  assert.doesNotMatch(client, /Display data may be stale/);
  assert.doesNotMatch(client, /Live data source is disconnected/);
  assert.match(client, /statusNotice\.title/);
});

test("publishing manager republishes when source state changes with unchanged hash", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /latestPublishedSourceMode/);
  assert.match(manager, /latestPublishedSourceConnected/);
  assert.match(manager, /sourceUnchanged/);
});

test("viewer bundle parser exposes canonical_data_present and timing fields", async () => {
  const { parseViewerBundleRpcResult } = await import(
    pathToFileURL(path.join(repoRoot, "src/lib/hosted/viewer-bundle.ts")).href
  );
  const parsed = parseViewerBundleRpcResult({
    ok: true,
    code: "viewer_ready",
    project: { slug: "demo" },
    display: { slug: "stream-bid-display", name: "Stream Bid Display" },
    html_content: "<html></html>",
    publisher_online: true,
    source_connected: false,
    source_mode: "webpage-scraper",
    canonical_data_present: true,
    data_stale: false,
    stale_reason: null,
    snapshot_received_at: "2026-07-21T12:00:00.000Z",
    publisher_last_heartbeat_at: "2026-07-21T12:00:05.000Z",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.canonicalDataPresent, true);
  assert.equal(parsed.snapshotReceivedAt, "2026-07-21T12:00:00.000Z");
  assert.equal(parsed.publisherLastHeartbeatAt, "2026-07-21T12:00:05.000Z");
});
