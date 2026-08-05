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

test("desktop engine controls always use local IPC for webpage scrapers", () => {
  const client = read("src/lib/desktop/client.ts");
  assert.match(client, /engine_type !== "webpage-scraper"/);
  assert.match(client, /return true;/);
});

test("engine controls use IPC start path in desktop runtime", () => {
  const controls = read("src/components/data-engines/webpage-scraper/EngineControls.tsx");
  const client = read("src/lib/desktop/client.ts");
  assert.match(controls, /controlDesktopEngine/);
  assert.match(client, /api\.engines\.start/);
});

test("desired-state API applies engine manager start/stop for local-desktop mode", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  const localApi = read("desktop/src/services/local-api-server.ts");
  assert.match(localData, /async applyDesiredState/);
  assert.match(localData, /this\.engineManager\.start/);
  assert.match(localApi, /applyDesiredState/);
});

test("engine manager uses Electron runtime for packaged worker spawn", () => {
  const processManager = read("desktop/src/services/process-manager.ts");
  const engineManager = read("desktop/src/services/engine-manager.ts");
  assert.match(processManager, /ELECTRON_RUN_AS_NODE/);
  assert.match(engineManager, /getWorkerEntryPath/);
  assert.match(engineManager, /async start\(/);
});

test("engine start logs blocked validation and spawn failures", () => {
  const engineManager = read("desktop/src/services/engine-manager.ts");
  assert.match(engineManager, /engine\.start\.blocked/);
  assert.match(engineManager, /console\.(info|warn)/);
});
