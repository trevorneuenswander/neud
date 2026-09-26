#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("live scraper snapshots notify display bridge before bag live state processing", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  const recordSnapshot = service.slice(service.indexOf("recordSnapshot("));
  const insertIndex = recordSnapshot.indexOf(
    "const snapshot = this.dataSources.insertSnapshot(engineId, input);",
  );
  const processIndex = recordSnapshot.indexOf(
    "this.bagLiveState.processSnapshot(engineId, snapshot);",
  );
  const fastPathIndex = recordSnapshot.indexOf("isLiveScraperSnapshot");
  const notifyIndex = recordSnapshot.indexOf(
    "this.tryNotifyProjectDisplayDataChanged(projectId);",
    fastPathIndex,
  );
  assert.ok(insertIndex >= 0 && processIndex >= 0 && notifyIndex >= 0);
  assert.ok(notifyIndex > insertIndex);
  assert.ok(notifyIndex < processIndex);
});

test("display bridge SSE carries trace metadata for latency correlation", () => {
  const events = read("desktop/src/displays/display-bridge-events.ts");
  const runtime = read("public/neud-display-runtime.js");
  assert.match(events, /traceEventId/);
  assert.match(events, /emittedAtMs/);
  assert.match(runtime, /traceEventId/);
  assert.match(runtime, /displayBridgeEventsConnected/);
  assert.match(runtime, /live-display-latency/);
});

test("worker live snapshots include publish timing for desktop latency traces", () => {
  const worker = read("workers/data-engine/src/adapters/bag-auction-event-driven.js");
  const client = read("workers/data-engine/src/local-client.js");
  assert.match(worker, /workerPublishedAt/);
  assert.match(client, /liveTiming/);
});

test("stream displays report render timing without changing animation code", () => {
  const bid = read("desktop/src/displays/stream-bid-v2-bridge.js");
  const quail = read("desktop/src/displays/led-display-quail-v2-bridge.js");
  assert.match(bid, /__NEUD_REPORT_DISPLAY_LATENCY__/);
  assert.match(quail, /__NEUD_REPORT_DISPLAY_LATENCY__/);
});

test("runtime diagnostics surface display delivery lag", () => {
  const ui = read("src/components/data-engines/webpage-scraper/RuntimeDiagnostics.tsx");
  assert.match(ui, /Display delivery lag/);
  assert.match(ui, /liveDisplayLatency/);
});

test("display config keeps same-origin dataUrl (Next proxy to local API)", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /dataUrl: input\.dataUrl/);
  assert.doesNotMatch(
    templates,
    /resolveDesktopDisplayDataUrl\(input\.dataUrl, localApiBase\)/,
  );
});

test("local API CORS preflight allows display runtime fetch headers", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /x-neud-display-client/i);
  assert.match(server, /x-neud-trace-event-id/i);
});

test("live scraper snapshot promotes in-memory payload before display notify", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /inMemoryLatestScraperPayloadByEngine/);
  assert.match(service, /promoteInMemoryLiveScraperPayload/);
  assert.match(service, /getLatestBagSnapshotPayloadForProject/);
  const promoteIndex = service.indexOf("promoteInMemoryLiveScraperPayload");
  const insertIndex = service.indexOf("this.dataSources.insertSnapshot(engineId, input);");
  assert.ok(promoteIndex >= 0 && insertIndex >= 0);
  assert.ok(promoteIndex < insertIndex);
});

test("pipeline trace persists per-stage events for live display diagnosis", () => {
  const log = read("desktop/src/services/live-display-pipeline-log.ts");
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(log, /live-display-pipeline\.jsonl/);
  assert.match(service, /desktop\.sqlite_insert_finished/);
  assert.match(service, /desktop\.notify_called/);
  assert.match(service, /desktop\.notify_skipped/);
  assert.match(service, /desktop\.sse_notify_published/);
});

test("SSE route logs write/flush/emitted after socket flush", () => {
  const routes = read("desktop/src/displays/display-bridge-routes.ts");
  assert.match(routes, /desktop\.sse_write_started/);
  assert.match(routes, /desktop\.sse_flush_finished/);
  assert.match(routes, /desktop\.sse_emitted/);
  assert.match(routes, /flushHeaders/);
  assert.match(routes, /setNoDelay/);
  assert.match(routes, /X-Accel-Buffering/);
  assert.doesNotMatch(routes, /compress|gzip|brotli/i);
});

test("browser pipeline stages use client timestamps for atMs", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /stage: "browser\.sse_received"[\s\S]*?atMs: input\.displayBridgeReceivedAt/);
  assert.match(service, /sseDeliveryLagMs/);
});

test("browser pipeline stages log even when engine latency trace is not correlated", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  const block = service.slice(
    service.indexOf("recordLiveDisplayClientLatencyReport("),
    service.indexOf("private getBagEngineForProject(projectId: string)"),
  );
  const logIndex = block.indexOf('stage: "browser.sse_received"');
  const earlyReturnIndex = block.indexOf("if (!existing) {\n      return null;\n    }");
  assert.ok(logIndex >= 0 && earlyReturnIndex >= 0);
  assert.ok(logIndex < earlyReturnIndex);
});

test("display-data GET resolves canonical bridge payload (not raw in-memory scraper only)", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /getGenericDisplayBridgeData\(projectId: string\)/);
  assert.match(service, /getActiveCanonicalProjectSnapshot\(projectId\)/);
  const bridgeBlock = service.slice(
    service.indexOf("getGenericDisplayBridgeData(projectId: string)"),
    service.indexOf("getActiveCanonicalProjectSnapshot(projectId: string)"),
  );
  assert.doesNotMatch(bridgeBlock, /inMemoryLatestScraperPayloadByEngine/);
});
