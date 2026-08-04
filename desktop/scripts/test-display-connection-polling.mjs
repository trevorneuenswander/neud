import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("display card stops polling when data connection is disabled", () => {
  const card = readSrc("src/components/displays/DisplayCard.tsx");
  assert.match(card, /if \(!shouldUseLocalDataClient\(\) \|\| !enabled\)/);
  assert.match(card, /\[display\.dataPath, enabled, hasLivePayload, hasLiveSnapshot\]/);
  assert.match(card, /stopPolling\(\)/);
  assert.match(card, /response\.status === 409/);
});

test("display card preview iframe only mounts when enabled", () => {
  const card = readSrc("src/components/displays/DisplayCard.tsx");
  const preview = readSrc("src/components/displays/DisplayPreviewPanel.tsx");
  assert.match(preview, /if \(!enabled\)/);
  assert.match(preview, /Display data is disconnected/);
  assert.match(card, /enabled=\{enabled\}/);
});

test("new auction display core stops polling on disabled payload", () => {
  const core = readSrc("public/displays/shared/new-auction-display-core.js");
  assert.match(core, /dataConnected === false/);
  assert.match(core, /stopPolling\(\)/);
  assert.match(core, /onDisabled/);
  assert.match(core, /createDisplayDataPoller/);
  assert.match(core, /showDisplayOffPage/);
});

test("new bid and ticker displays show off state when disconnected", () => {
  const bid = readSrc("public/displays/new-bid-display-v1/index.html");
  const ticker = readSrc("public/displays/new-ticker-v1/index.html");
  assert.match(bid, /onDisabled: \(\) => core\.showDisplayOffPage\(\)/);
  assert.match(ticker, /onDisabled: \(\) => core\.showDisplayOffPage\(\)/);
});

test("pylon and lower ticker stop live polling when disabled", () => {
  const pylon = readSrc("public/displays/pylon/index.html");
  const ticker = readSrc("public/displays/lower-ticker-v5/index.html");
  assert.match(pylon, /function stopLiveConnection/);
  assert.match(pylon, /clearInterval\(pollTimer\)/);
  assert.match(pylon, /showDisplayOff\(\)/);
  assert.match(ticker, /function stopLiveConnection/);
  assert.match(ticker, /clearInterval\(pollTimer\)/);
  assert.match(ticker, /showDisplayOff\(\)/);
});

test("local API skips viewer heartbeat for disabled platform displays", () => {
  const api = readSrc("desktop/src/services/local-api-server.ts");
  assert.match(api, /sendDisabledPlatformDisplayData/);
  assert.match(api, /sendJsonNoStore\(response, 409/);
  assert.match(api, /dataConnected: false/);
  assert.match(api, /if \(!this\.data\.isPylonDisplayEnabled\(\)\)/);
  assert.match(api, /if \(!this\.data\.isLowerTickerDisplayEnabled\(\)\)/);
  assert.match(api, /if \(!this\.data\.isNewBidDisplayEnabled\(\)\)/);
  assert.match(api, /if \(!this\.data\.isNewTickerDisplayEnabled\(\)\)/);

  const pylonBlock = api.slice(
    api.indexOf('url.pathname === "/api/displays/pylon/data"'),
    api.indexOf('url.pathname === "/api/displays/pylon/enabled"'),
  );
  assert.match(
    pylonBlock,
    /if \(!this\.data\.isPylonDisplayEnabled\(\)\) \{\s*this\.logDisplayDataRequest\(request, "pylon", false\);\s*return this\.sendDisabledPlatformDisplayData/,
  );
  assert.match(pylonBlock, /this\.touchDisplayViewer\(request, "platform", "pylon"\)/);
});

test("display connection broadcast notifies open viewers", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  assert.match(localData, /notifyPlatformDisplayConnectionChanged/);
  assert.match(localData, /neud:displayConnection:changed/);
  assert.match(localData, /setPylonDisplayEnabled[\s\S]{0,200}notifyPlatformDisplayConnectionChanged\("pylon"/);
});

test("shared display connection runtime stops full polling and uses status heartbeat", () => {
  const runtime = readSrc("public/displays/shared/display-connection.js");
  assert.match(runtime, /createDisplayDataPoller/);
  assert.match(runtime, /STATUS_HEARTBEAT_MS = 30000/);
  assert.match(runtime, /response\.status === 409/);
  assert.match(runtime, /let isPolling = false/);
  assert.match(runtime, /function stopPolling\(\)/);
  assert.match(runtime, /deriveStatusEndpoint/);
  assert.match(runtime, /BroadcastChannel/);
  assert.match(runtime, /abort\(\)/);
});

test("display card closes preview and broadcasts on disconnect", () => {
  const card = readSrc("src/components/displays/DisplayCard.tsx");
  assert.match(card, /notifyDisplayConnectionChanged/);
  assert.match(card, /closePreview/);
  assert.match(card, /enabled=\{enabled\}/);
  assert.match(card, /setBridgeReady\(false\)/);
  assert.match(card, /AbortController/);
  assert.match(card, /response\.status === 409/);
});

test("display enable toggle does not stop scraper engine", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  const card = readSrc("src/components/displays/DisplayCard.tsx");
  assert.doesNotMatch(localData, /setPylonDisplayEnabled[\s\S]{0,400}stopAll/s);
  assert.doesNotMatch(localData, /setNewBidDisplayEnabled[\s\S]{0,400}updateDesiredState/s);
  assert.doesNotMatch(card, /engines\.stop/);
});

test("custom developer display data route checks enabled before heartbeat", () => {
  const api = readSrc("desktop/src/services/local-api-server.ts");
  const customBlock = api.slice(
    api.indexOf('action === "data" && request.method === "GET"'),
    api.indexOf("if (!action && request.method === \"GET\")"),
  );
  assert.match(customBlock, /!viewerState\.enabled && !previewMode/);
  assert.match(customBlock, /display_disabled/);
  assert.match(
    customBlock,
    /if \(!viewerState\.enabled && !previewMode\) \{\s*return sendJsonNoStore/,
  );
  assert.match(customBlock, /enabled: viewerState\.enabled/);
  assert.match(customBlock, /dataConnected: viewerState\.enabled/);
});
