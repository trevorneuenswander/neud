import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("runtime injects bridge in head before body scripts", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /injectIntoHead/);
  assert.match(templates, /DISPLAY_BRIDGE_SCRIPT/);
  assert.match(templates, /DISPLAY_FETCH_GUARD_SCRIPT/);
});

test("runtime retains snapshot until iframe readiness", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /latestSnapshot/);
  assert.match(templates, /initial snapshot retained until iframe readiness/);
  assert.match(templates, /markBridgeReady/);
  assert.match(templates, /DOMContentLoaded/);
});

test("runtime posts bridge acknowledgement to parent preview", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  const bridge = read("src/lib/displays/display-preview-bridge.ts");
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");

  assert.match(templates, /NEUD_DISPLAY_BRIDGE_ACK/);
  assert.match(bridge, /NEUD_DISPLAY_BRIDGE_ACK/);
  assert.match(canvas, /isDisplayBridgeAckMessage/);
  assert.match(canvas, /addEventListener\("message"/);
});

test("iframe key remains stable across data revisions", () => {
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");
  assert.match(canvas, /key=\{iframeKey\}/);
  assert.doesNotMatch(canvas, /revision/);
  assert.doesNotMatch(canvas, /JSON\.stringify/);
});

test("disable stops injected runtime polling via fetch guard hook", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /__NEUD_RUNTIME_STOP__/);
  assert.match(templates, /window\.__NEUD_DISPLAY_DATA_DISCONNECTED__/);
});

test("readiness handshake listens for NEUD_DISPLAY_READY", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /NEUD_DISPLAY_READY/);
  assert.match(templates, /signalReady/);
});
