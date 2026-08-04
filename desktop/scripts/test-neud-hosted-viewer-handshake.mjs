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

test("hosted viewer uses NEUD display runtime contract", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  const bridge = read("src/lib/hosted/hosted-display-runtime-bridge.ts");

  assert.match(client, /buildNeudDataUpdateMessage/);
  assert.match(client, /isNeudDisplayReadyMessage/);
  assert.match(client, /prepareHostedDisplayDocument/);
  assert.doesNotMatch(client, /neud:canonical-payload/);
  assert.doesNotMatch(client, /postMessage\([\s\S]*"\*"/);

  assert.match(bridge, /NEUD_DATA_UPDATE/);
  assert.match(bridge, /NEUD_DISPLAY_READY/);
  assert.match(bridge, /source: NEUD_RUNTIME_MESSAGE_SOURCE/);
  assert.match(bridge, /version: NEUD_DATA_UPDATE_VERSION/);
});

test("hosted viewer reloads iframe when revision key changes or iframe is empty", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  const bundle = read("src/lib/hosted/viewer-bundle.ts");
  assert.match(client, /loadedRevisionRef/);
  assert.match(bundle, /published_revision_id/);
  assert.match(client, /key=\{bundle\?\.revisionKey/);
  assert.match(client, /srcDoc=\{preparedHtml\}/);
  assert.match(client, /deliverSnapshotToIframe/);
});

test("hosted viewer validates message origin and iframe source", () => {
  const bridge = read("src/lib/hosted/hosted-display-runtime-bridge.ts");
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.match(bridge, /isAllowedHostedViewerMessageOrigin/);
  assert.match(bridge, /isHostedViewerMessageFromIframe/);
  assert.match(bridge, /resolveHostedPostMessageTargetOrigin/);
  assert.match(client, /useLayoutEffect/);
  assert.match(client, /srcDoc=\{preparedHtml\}/);
});

test("hosted viewer normalizes refresh rate bounds", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  const refresh = read("src/lib/displays/refresh-rate.ts");
  assert.match(client, /normalizeDisplayRefreshRateMs/);
  assert.match(refresh, /DEFAULT_DISPLAY_REFRESH_RATE_MS = 5000/);
  assert.match(refresh, /1000/);
  assert.match(refresh, /60000/);
});

test("hosted display document disables self-polling in iframe", () => {
  const document = read("src/lib/developer-tools/display-document.ts");
  assert.match(document, /prepareHostedDisplayDocument/);
  assert.match(document, /__NEUD_DISPLAY_DATA_DISCONNECTED__/);
  assert.match(document, /DISPLAY_BRIDGE_SCRIPT/);
  assert.match(document, /HOSTED_BRIDGE_INBOUND_SCRIPT/);
  assert.match(document, /HOSTED_DISPLAY_BRIDGE_MARKER/);
  assert.match(document, /neud-hosted-bridge:v3/);
});

test("hosted viewer preserves transparent iframe and aspect ratio sizing", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.match(client, /bg-transparent/);
  assert.match(client, /aspectRatio/);
  assert.match(client, /display_width/);
  assert.match(client, /display_height/);
  assert.match(client, /fullscreen/);
});

test("hosted viewer resolves canonical payload for runtime delivery", () => {
  const bridge = read("src/lib/hosted/hosted-display-runtime-bridge.ts");
  assert.match(bridge, /resolveDisplayRuntimeSnapshot/);
  assert.match(bridge, /resolveHostedCanonicalSnapshot/);
});

test("rejected legacy hosted bridge format is absent", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.doesNotMatch(client, /type:\s*"neud:/);
});

test("hosted viewer defers embedded preview and sends one layout refresh", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  const bridge = read("src/lib/hosted/hosted-display-runtime-bridge.ts");
  assert.match(client, /buildNeudLayoutRefreshMessage/);
  assert.match(client, /notifyEmbeddedLayoutReady/);
  assert.match(client, /previewLayoutReadyRef/);
  assert.match(client, /oneTimeLayoutRefreshSentRef/);
  assert.doesNotMatch(client, /scheduleLayoutRefreshBurst/);
  assert.match(bridge, /NEUD_LAYOUT_REFRESH/);
});
