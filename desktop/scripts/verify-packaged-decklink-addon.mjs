#!/usr/bin/env node
/**
 * Fail Windows release packaging when the DeckLink native addon is missing or a stub.
 *
 * Usage:
 *   node desktop/scripts/verify-packaged-decklink-addon.mjs
 *   NEUD_UNPACKED_ROOT=desktop/release/win-unpacked node desktop/scripts/verify-packaged-decklink-addon.mjs --packaged
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findReleaseRoots } from "./lib/release-security-scan.mjs";
import { isRealDeckLinkAddonBinary } from "./build-decklink-addon.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const requirePackaged = process.argv.includes("--packaged");

function resolveAddonPaths() {
  const distAddon = path.join(desktopRoot, "dist", "platform", "decklink", "neud_decklink.node");
  const distMeta = path.join(desktopRoot, "dist", "platform", "decklink", "neud_decklink.meta.json");
  const paths = [{ addon: distAddon, meta: distMeta, label: "dist" }];

  if (requirePackaged) {
    const unpacked =
      process.env.NEUD_UNPACKED_ROOT?.trim() || findReleaseRoots(desktopRoot)[0] || null;
    assert.ok(unpacked, "win-unpacked root not found; build package:win first or set NEUD_UNPACKED_ROOT.");
    paths.push({
      addon: path.join(
        unpacked,
        "resources",
        "app.asar.unpacked",
        "dist",
        "platform",
        "decklink",
        "neud_decklink.node",
      ),
      meta: path.join(
        unpacked,
        "resources",
        "app.asar.unpacked",
        "dist",
        "platform",
        "decklink",
        "neud_decklink.meta.json",
      ),
      label: "packaged",
    });
  }
  return paths;
}

for (const entry of resolveAddonPaths()) {
  assert.ok(fs.existsSync(entry.addon), `Missing DeckLink addon (${entry.label}): ${entry.addon}`);
  assert.ok(fs.existsSync(entry.meta), `Missing DeckLink meta (${entry.label}): ${entry.meta}`);
  const meta = JSON.parse(fs.readFileSync(entry.meta, "utf8"));
  assert.equal(
    meta.stub,
    false,
    `DeckLink addon is a stub (${entry.label}). Windows release installers must ship a real SDK build.`,
  );
  assert.ok(
    isRealDeckLinkAddonBinary(entry.addon),
    `DeckLink addon failed real-binary check (${entry.label}).`,
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        label: entry.label,
        addon: entry.addon,
        stub: meta.stub,
        electronTarget: meta.electronTarget ?? null,
        arch: meta.arch ?? null,
        sdkRoot: meta.sdkRoot ?? null,
      },
      null,
      2,
    ),
  );
}

if (requirePackaged && process.platform === "win32") {
  const unpacked =
    process.env.NEUD_UNPACKED_ROOT?.trim() || findReleaseRoots(desktopRoot)[0] || null;
  assert.ok(unpacked, "win-unpacked root required for Windows recorder verification.");
  const recorder = path.join(
    unpacked,
    "resources",
    "app.asar.unpacked",
    "dist",
    "platform",
    "windows",
    "neud_recorder.node",
  );
  const video = path.join(
    unpacked,
    "resources",
    "app.asar.unpacked",
    "dist",
    "platform",
    "windows",
    "neud_video.node",
  );
  assert.ok(fs.existsSync(recorder), `Missing packaged Windows recorder addon: ${recorder}`);
  assert.ok(fs.existsSync(video), `Missing packaged Windows video addon: ${video}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        packagedWindowsNatives: { recorder, video },
      },
      null,
      2,
    ),
  );
}
