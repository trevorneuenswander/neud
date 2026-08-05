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

test("engine manager records worker exit errors for UI visibility", () => {
  const engineManager = read("desktop/src/services/engine-manager.ts");
  assert.match(engineManager, /Worker exited unexpectedly/);
  assert.match(engineManager, /lastError: exitMessage/);
});

test("inline BAG scraper controls surface errors when notification area is hidden", () => {
  const controls = read("src/components/data-engines/webpage-scraper/EngineControls.tsx");
  assert.match(controls, /!showNotificationArea && hasNotification/);
});

test("worker spawn sanitizes packaged puppeteer environment", () => {
  const engineManager = read("desktop/src/services/engine-manager.ts");
  assert.match(engineManager, /delete env\.PUPPETEER_CACHE_DIR/);
  assert.match(engineManager, /NEUD_RESOURCES_PATH/);
  assert.match(engineManager, /NODE_ENV = "production"/);
});

test("spawn uses ELECTRON_RUN_AS_NODE", () => {
  const processManager = read("desktop/src/services/process-manager.ts");
  assert.match(processManager, /ELECTRON_RUN_AS_NODE: "1"/);
});
