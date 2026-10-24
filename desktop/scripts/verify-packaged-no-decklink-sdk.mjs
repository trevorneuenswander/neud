#!/usr/bin/env node
/**
 * Ensure the packaged Windows tree does not ship DeckLink SDK sources/archives.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findReleaseRoots } from "./lib/release-security-scan.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unpacked =
  process.env.NEUD_UNPACKED_ROOT?.trim() || findReleaseRoots(desktopRoot)[0] || null;
assert.ok(unpacked, "win-unpacked root not found");

const forbiddenName = /(DeckLinkAPI\.idl|DeckLinkAPIDispatch\.cpp|DeckLinkSDK\.zip|Blackmagic DeckLink SDK)/i;
const hits = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (forbiddenName.test(entry.name)) {
      hits.push(full);
      continue;
    }
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(full);
    }
  }
}

walk(unpacked);
assert.deepEqual(hits, [], `Forbidden DeckLink SDK artifacts in package:\n${hits.join("\n")}`);
console.log(JSON.stringify({ ok: true, unpackedRoot: unpacked, scanned: true }, null, 2));
