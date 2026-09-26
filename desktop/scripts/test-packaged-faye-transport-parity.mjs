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

test("root build:desktop stages worker after desktop compile", () => {
  const script = read("package.json");
  const buildDesktop = script.match(/"build:desktop": "([^"]+)"/)?.[1] ?? "";
  const desktopIndex = buildDesktop.indexOf("build -w @neud/desktop");
  const stageIndex = buildDesktop.indexOf("stage-standalone.mjs");
  assert.ok(desktopIndex >= 0 && stageIndex > desktopIndex);
});

test("macOS workflow stages worker after desktop compile", () => {
  const workflow = read(".github/workflows/build-macos.yml");
  const compileIndex = workflow.indexOf("npm run build -w @neud/desktop");
  const stageIndex = workflow.indexOf("stage-standalone.mjs");
  assert.ok(compileIndex >= 0 && stageIndex > compileIndex);
  assert.match(workflow, /bag-event-driven-session\.js/);
});

test("packaged worker spawn sets NEUD_PACKAGED and run id", () => {
  const manager = read("desktop/src/services/engine-manager.ts");
  assert.match(manager, /NEUD_PACKAGED = "1"/);
  assert.match(manager, /NEUD_ENGINE_RUN_ID/);
});

test("event-driven Faye session source module exists", () => {
  const sourcePath = path.join(
    repoRoot,
    "workers",
    "data-engine",
    "src",
    "adapters",
    "bag-event-driven-session.js",
  );
  assert.equal(fs.existsSync(sourcePath), true);
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.match(source, /installLiveFeedBridgeOnPage/);
  assert.match(source, /fallbackToLegacy/);
});

test("worker build:local copies src tree into dist-local", () => {
  const buildLocal = read("workers/data-engine/scripts/build-local-dist.mjs");
  assert.match(buildLocal, /copyJsTree\(sourceRoot, distRoot\)/);
});

test("desktop build runs worker build and build:local before tsc", () => {
  const buildScript = read("desktop/package.json");
  const match = buildScript.match(/"build": "([^"]+)"/)?.[1] ?? "";
  const buildLocalIndex = match.indexOf("build:local");
  const tscIndex = match.indexOf("tsc -p tsconfig.json");
  assert.ok(buildLocalIndex >= 0, "desktop build must run worker build:local");
  assert.ok(tscIndex > buildLocalIndex, "worker dist-local must exist before desktop compile");
});

test("stage-standalone copies dist-local worker into packaged staging", () => {
  const stage = read("desktop/scripts/stage-standalone.mjs");
  assert.match(stage, /dist-local/);
  assert.match(stage, /stageLocalWorker/);
  assert.match(stage, /copyRecursive\(localWorkerDist, workerDistTarget\)/);
});

test("macOS workflow verifies Faye session after build and staging", () => {
  const workflow = read(".github/workflows/build-macos.yml");
  assert.match(
    workflow,
    /test-packaged-faye-transport-parity-built-worker\.mjs/,
  );
  assert.match(
    workflow,
    /test-packaged-faye-transport-parity-staged-worker\.mjs/,
  );
  assert.match(workflow, /bag-event-driven-session\.js/);
});

test("bag runtime config does not define a separate Faye endpoint URL", () => {
  const config = read("shared/bag/bag-runtime-config.json");
  assert.doesNotMatch(config, /faye/i);
});
