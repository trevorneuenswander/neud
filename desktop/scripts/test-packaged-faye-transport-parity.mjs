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

test("staged worker path includes event-driven Faye session module", () => {
  const stage = read("desktop/scripts/stage-standalone.mjs");
  assert.match(stage, /dist-local/);
  const stagedWorker = path.join(
    repoRoot,
    "workers",
    "data-engine",
    "dist-local",
    "adapters",
    "bag-event-driven-session.js",
  );
  assert.equal(
    fs.existsSync(stagedWorker),
    true,
    "Run npm run build -w @neud/desktop to produce dist-local worker",
  );
  const source = fs.readFileSync(stagedWorker, "utf8");
  assert.match(source, /installLiveFeedBridgeOnPage/);
  assert.match(source, /fallbackToLegacy/);
});

test("bag runtime config does not define a separate Faye endpoint URL", () => {
  const config = read("shared/bag/bag-runtime-config.json");
  assert.doesNotMatch(config, /faye/i);
});
