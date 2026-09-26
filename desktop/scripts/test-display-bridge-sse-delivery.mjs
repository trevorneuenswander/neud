#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function loadDist(moduleRelativePath) {
  const url = new URL(`../dist/${moduleRelativePath}`, import.meta.url);
  return import(url.href);
}

test("SSE payload framing ends with blank line", async () => {
  const { formatDisplayBridgeSseEvent } = await loadDist("displays/display-bridge-routes.js");
  const frame = formatDisplayBridgeSseEvent({
    type: "neud-display-data-changed",
    projectId: "proj-1",
    revision: 3,
    contentHash: "abc",
    traceEventId: "trace-1",
    emittedAtMs: Date.now(),
  });
  assert.match(frame, /^event: neud-display-data-changed\n/);
  assert.match(frame, /\n\n$/);
  assert.doesNotMatch(frame, /Content-Encoding/i);
});

test("raw HTTP client receives SSE data-changed within 50ms of publish", async () => {
  const { DisplayBridgeEvents } = await loadDist("displays/display-bridge-events.js");
  const { handleDisplayBridgeRoute } = await loadDist("displays/display-bridge-routes.js");

  const bridge = new DisplayBridgeEvents();
  const projectId = "test-project-sse";
  const pipeline = [];

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    void handleDisplayBridgeRoute(request, response, url, {
      displayBridgeEvents: bridge,
      projectExists: (id) => id === projectId,
      getSyncState: () => ({ revision: 0, contentHash: null }),
      onPipelineEvent: (entry) => pipeline.push(entry),
    });
  });

  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 125_000;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  let clientRequest = null;
  const responsePromise = new Promise((resolve, reject) => {
    clientRequest = http.get(
      `http://127.0.0.1:${port}/api/projects/${encodeURIComponent(projectId)}/display-bridge/events`,
      (res) => {
        assert.equal(res.statusCode, 200);
        assert.match(String(res.headers["content-type"] ?? ""), /text\/event-stream/i);
        assert.equal(res.headers["content-encoding"], undefined);
        assert.match(String(res.headers["cache-control"] ?? ""), /no-cache/i);
        resolve(res);
      },
    );
    clientRequest.on("error", reject);
  });

  const res = await responsePromise;
  let buffer = "";
  res.setEncoding("utf8");
  res.on("data", (chunk) => {
    buffer += chunk;
  });

  await once(res, "data");

  const publishedAt = Date.now();
  bridge.publishDisplayDataChanged(projectId, {
    revision: 1,
    contentHash: "hash-1",
    traceEventId: "trace-sse-1",
    emittedAtMs: publishedAt,
  });

  const deadline = Date.now() + 500;
  while (!buffer.includes("neud-display-data-changed") && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5));
  }

  assert.match(buffer, /neud-display-data-changed/);
  assert.match(buffer, /trace-sse-1/);

  const flushFinished = pipeline.find((e) => e.stage === "desktop.sse_flush_finished");
  const emitted = pipeline.find((e) => e.stage === "desktop.sse_emitted");
  assert.ok(flushFinished);
  assert.ok(emitted);
  assert.equal(emitted.traceEventId, "trace-sse-1");

  res.destroy();
  clientRequest?.destroy();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});
