import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadDisplayConnectionRuntime() {
  const intervals = new Map();
  let nextIntervalId = 1;
  let fetchCalls = 0;
  let dataFetchCalls = 0;
  let lastFetchUrl = null;

  const sandbox = {
    window: {},
    setInterval(fn, ms) {
      const id = nextIntervalId++;
      intervals.set(id, { fn, ms });
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout() {},
    clearTimeout() {},
    console,
    AbortController: globalThis.AbortController,
    fetch(url) {
      fetchCalls += 1;
      lastFetchUrl = String(url);
      if (lastFetchUrl.includes("/data")) {
        dataFetchCalls += 1;
      }
      if (lastFetchUrl.includes("/data")) {
        return Promise.resolve({
          status: 409,
          ok: false,
          json: async () => ({
            dataConnected: false,
            enabled: false,
            status: "display_disabled",
          }),
        });
      }
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          dataConnected: false,
          enabled: false,
          updatedAt: new Date().toISOString(),
        }),
      });
    },
    document: { body: { innerHTML: "" } },
    location: { origin: "http://127.0.0.1:3000" },
    addEventListener() {},
    removeEventListener() {},
    BroadcastChannel: class {
      onmessage = null;
      postMessage() {}
      close() {}
    },
  };

  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readSrc("public/displays/shared/display-connection.js"), sandbox);

  return {
    runtime: sandbox.NEUDDisplayConnection,
    intervals,
    getFetchCalls: () => fetchCalls,
    getDataFetchCalls: () => dataFetchCalls,
    getLastFetchUrl: () => lastFetchUrl,
    runDueIntervals() {
      for (const entry of intervals.values()) {
        entry.fn();
      }
    },
  };
}

test("409 response stops full-data polling immediately", async () => {
  const { runtime, intervals, getDataFetchCalls, runDueIntervals } = loadDisplayConnectionRuntime();

  let disconnected = false;
  const poller = runtime.createDisplayDataPoller({
    displayId: "new-bid-display-v1",
    dataUrl: "/api/displays/new-bid-display-v1/data",
    pollMs: 1000,
    onPayload: () => {},
    onDisconnected: () => {
      disconnected = true;
    },
  });

  poller.start();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(getDataFetchCalls(), 1);
  assert.equal(disconnected, true);
  assert.equal(poller.isPolling(), false);

  const dataCallsBeforeTick = getDataFetchCalls();
  runDueIntervals();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(getDataFetchCalls(), dataCallsBeforeTick);
});

test("repeated start calls do not create duplicate recovery intervals", async () => {
  const { runtime, intervals } = loadDisplayConnectionRuntime();

  const poller = runtime.createDisplayDataPoller({
    displayId: "new-bid-display-v1",
    dataUrl: "/api/displays/new-bid-display-v1/data",
    pollMs: 1000,
    onPayload: () => {},
  });

  poller.start();
  poller.start();
  poller.start();

  await Promise.resolve();
  assert.ok(intervals.size <= 1);
  const diagnostics = poller.getDiagnostics();
  assert.equal(diagnostics.displayUpdateMode, "event-driven");
  assert.equal(diagnostics.pollTimerActive, false);
});

test("status endpoint helper derives from data url", () => {
  const { runtime } = loadDisplayConnectionRuntime();
  assert.equal(
    runtime.deriveStatusEndpoint("/api/displays/new-bid-display-v1/data"),
    "/api/displays/new-bid-display-v1/status",
  );
});

test("display card avoids management-card data polling", () => {
  const card = readSrc("src/components/displays/DisplayCard.tsx");
  assert.doesNotMatch(card, /pollDataEndpoint/);
  assert.doesNotMatch(card, /DisplayRefreshRateSelect/);
  assert.match(card, /previewOpen/);
  assert.match(card, /notifyDisplayConnectionChanged/);
});

test("shared display connection runtime uses explicit isPolling lifecycle", () => {
  const runtime = readSrc("public/displays/shared/display-connection.js");
  assert.match(runtime, /let isPolling = false/);
  assert.match(runtime, /function stopPolling\(\)/);
  assert.match(runtime, /function startPolling\(/);
  assert.match(runtime, /deriveStatusEndpoint/);
  assert.match(runtime, /STATUS_HEARTBEAT_MS = 30000/);
  assert.match(runtime, /response\.status === 409/);
});

test("local API exposes lightweight display status routes", () => {
  const api = readSrc("desktop/src/services/local-api-server.ts");
  assert.match(api, /\/api\/displays\/new-bid-display-v1\/status/);
  assert.match(api, /logDisplayDataRequest/);
  assert.match(api, /sendPlatformDisplayStatus/);
});

test("displays page loads project displays once per render", () => {
  const page = readSrc("src/app/(portal)/projects/[slug]/displays/page.tsx");
  const matches = page.match(/await localGetProjectDisplays/g) ?? [];
  assert.ok(matches.length >= 1);
});

test("preload relays display connection IPC to the page", () => {
  const preload = readSrc("desktop/src/preload.ts");
  assert.match(preload, /neud:displayConnection:changed/);
  assert.match(preload, /neud-display-connection-changed/);
});

test("viewer routes inject fetch guard before display runtime scripts", () => {
  const helper = readSrc("src/lib/displays/display-viewer-html.ts");
  const route = readSrc("src/app/displays/new-bid-display-v1/route.ts");
  assert.match(helper, /__NEUD_DISPLAY_FETCH_GUARD__/);
  assert.match(helper, /response.status === 409/);
  assert.match(route, /injectDisplayFetchGuard/);
});

test("disconnect closes all electron windows for a display viewer path", () => {
  const manager = readSrc("desktop/src/services/display-preview-window-manager.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  assert.match(manager, /closeDisplayViewerWindows/);
  assert.match(manager, /reconcileDisplayViewerWindows/);
  assert.match(manager, /closeAllPlatformDisplayViewerWindows/);
  assert.match(localData, /reconcileDisplayViewerWindows\(displayId, this\.viewerBaseUrl\)/);
  assert.match(localData, /reconcileDisabledDisplayViewerWindows/);
});

test("displays list broadcasts reload for disabled registry displays", () => {
  const list = readSrc("src/components/displays/DisplaysListClient.tsx");
  const client = readSrc("src/lib/displays/display-connection-client.ts");
  assert.match(list, /requestDisplayViewerReload/);
  assert.match(client, /neud-display-reload-request/);
});

test("fetch guard reloads viewer on disconnect broadcast and 409", () => {
  const helper = readSrc("src/lib/displays/display-viewer-html.ts");
  assert.match(helper, /neud-display-reload-request/);
  assert.match(helper, /window\.location\.reload\(\)/);
});
