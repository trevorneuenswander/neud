#!/usr/bin/env node
/**
 * Verifies production neud-display-runtime.js delivers plain snapshot objects
 * (not NEUD_DATA_UPDATE wrappers) to NEUDDisplay.subscribe callbacks.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("runtime _publish forwards plain snapshot objects to subscribers", () => {
  const runtimeSource = fs.readFileSync(
    path.join(repoRoot, "public/neud-display-runtime.js"),
    "utf8",
  );

  assert.match(runtimeSource, /subscribe: function \(callback\)/);
  assert.match(runtimeSource, /this\._subscribers\[i\]\(snapshot\)/);
  assert.doesNotMatch(
    runtimeSource,
    /this\._subscribers\[i\]\(\{\s*source:\s*NEUD_RUNTIME_SOURCE/s,
  );
});
