#!/usr/bin/env node
/**
 * Load neud_decklink.node under Electron's Node ABI and call probe/discover/getAdapterInfo.
 * Proves the packaged binary is a non-stub addon with callable enumeration APIs.
 * Does NOT claim hardware Key/Fill validation (discover may return [] without Desktop Video).
 *
 * Usage:
 *   node desktop/scripts/verify-decklink-addon-load.mjs
 *   NEUD_UNPACKED_ROOT=desktop/release/win-unpacked node desktop/scripts/verify-decklink-addon-load.mjs --packaged
 */
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { findReleaseRoots } from "./lib/release-security-scan.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const requirePackaged = process.argv.includes("--packaged");

function resolveAddonPath() {
  if (requirePackaged) {
    const unpacked =
      process.env.NEUD_UNPACKED_ROOT?.trim() || findReleaseRoots(desktopRoot)[0] || null;
    assert.ok(unpacked, "win-unpacked / mac unpacked root required for --packaged");
    const packaged = path.join(
      unpacked,
      process.platform === "darwin" ? "NEUD.app/Contents/Resources" : "resources",
      "app.asar.unpacked",
      "dist",
      "platform",
      "decklink",
      "neud_decklink.node",
    );
    // Windows electron-builder layout
    const winPackaged = path.join(
      unpacked,
      "resources",
      "app.asar.unpacked",
      "dist",
      "platform",
      "decklink",
      "neud_decklink.node",
    );
    if (fs.existsSync(winPackaged)) return winPackaged;
    if (fs.existsSync(packaged)) return packaged;
    assert.fail(`Packaged DeckLink addon not found under ${unpacked}`);
  }
  return path.join(desktopRoot, "dist", "platform", "decklink", "neud_decklink.node");
}

function resolveElectronBinary() {
  const candidates = [];
  try {
    candidates.push(require(path.join(desktopRoot, "node_modules", "electron")));
  } catch {
    // hoisted workspace install
  }
  try {
    candidates.push(require(path.join(repoRoot, "node_modules", "electron")));
  } catch {
    // continue
  }
  try {
    const pkg = require.resolve("electron/package.json", { paths: [desktopRoot, repoRoot] });
    const distPath = path.join(path.dirname(pkg), "dist");
    candidates.push(
      path.join(
        distPath,
        process.platform === "win32" ? "electron.exe" : "Electron.app/Contents/MacOS/Electron",
      ),
    );
  } catch {
    // continue
  }
  for (const candidate of candidates) {
    if (typeof candidate === "string" && fs.existsSync(candidate)) return candidate;
  }
  if (requirePackaged) {
    const unpacked =
      process.env.NEUD_UNPACKED_ROOT?.trim() || findReleaseRoots(desktopRoot)[0] || null;
    if (unpacked) {
      const exe = path.join(
        unpacked,
        process.platform === "win32" ? "NEUD.exe" : "NEUD.app/Contents/MacOS/NEUD",
      );
      if (fs.existsSync(exe)) return exe;
    }
  }
  throw new Error("Electron binary not found for DeckLink load verification.");
}

const addonPath = resolveAddonPath();
assert.ok(fs.existsSync(addonPath), `Missing DeckLink addon: ${addonPath}`);

const electronBinary = resolveElectronBinary();
const probeScript = `
  const path = ${JSON.stringify(addonPath)};
  let addon;
  try {
    addon = require(path);
  } catch (error) {
    console.log(JSON.stringify({ ok: false, stage: "dlopen", error: String(error && error.message || error) }));
    process.exit(1);
  }
  const adapter = typeof addon.getAdapterInfo === "function" ? JSON.parse(addon.getAdapterInfo()) : null;
  const probe = addon.probe();
  let discoverOk = false;
  let endpointCount = null;
  try {
    const raw = addon.discover();
    const parsed = JSON.parse(raw || "[]");
    discoverOk = Array.isArray(parsed);
    endpointCount = Array.isArray(parsed) ? parsed.length : null;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, stage: "discover", error: String(error && error.message || error), adapter, probe }));
    process.exit(1);
  }
  const stub = adapter && adapter.stub === true;
  const result = {
    ok: !stub && typeof addon.probe === "function" && typeof addon.discover === "function",
    stub: !!stub,
    compiledSdkVersion: adapter && adapter.compiledSdkVersion || null,
    probe,
    discoverOk,
    endpointCount,
    note: "endpointCount may be 0 without Blackmagic Desktop Video — not a hardware validation.",
  };
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
`;

const result = spawnSync(electronBinary, ["-e", probeScript], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  encoding: "utf8",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

const lines = (result.stdout || "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const payloadLine = [...lines].reverse().find((line) => line.startsWith("{"));
if (!payloadLine) {
  console.error(result.stderr || result.stdout || "No JSON payload from Electron load probe");
  process.exit(result.status ?? 1);
}

const payload = JSON.parse(payloadLine);
assert.equal(payload.stub, false, "DeckLink addon reported stub:true after load");
assert.equal(payload.ok, true, `DeckLink addon load verification failed: ${payloadLine}`);
assert.equal(payload.discoverOk, true, "discover() is not callable / did not return a JSON array");
console.log(JSON.stringify({ ok: true, addonPath, electronBinary, ...payload }, null, 2));
process.exit(0);
