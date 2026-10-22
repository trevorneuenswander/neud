/**
 * Smoke-load the native video addon and verify the shared interface surface.
 * Full ProRes alpha decode requires real ap4h/ap4x media (manual validation).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function resolveAddon() {
  const candidates = [
    path.join(desktopRoot, "dist/platform/macos/neud_video.node"),
    path.join(desktopRoot, "dist/platform/windows/neud_video.node"),
    path.join(desktopRoot, "native/video/build/Release/neud_video.node"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

test("neud_video addon exports decoder control surface", () => {
  const addonPath = resolveAddon();
  assert.ok(addonPath, "neud_video.node must exist (run build-video-addon.mjs)");
  const addon = require(addonPath);
  for (const name of [
    "open",
    "play",
    "pause",
    "stop",
    "restart",
    "setLoop",
    "getStatus",
    "pullFrame",
    "onFrame",
    "onState",
    "close",
    "platform",
  ]) {
    assert.equal(typeof addon[name], "function", name);
  }
  const platform = addon.platform();
  assert.equal(typeof platform.decoder, "string");
  assert.equal(typeof platform.available, "boolean");
  if (process.platform === "darwin") {
    assert.equal(platform.decoder, "avfoundation");
    assert.equal(platform.available, true);
  }
});

test("open rejects missing files without crashing", () => {
  const addonPath = resolveAddon();
  assert.ok(addonPath);
  const addon = require(addonPath);
  const missing = path.join(desktopRoot, "does-not-exist-prores.mov");
  const result = addon.open(missing);
  assert.equal(result.ok, false);
  assert.match(String(result.error || ""), /./);
});
