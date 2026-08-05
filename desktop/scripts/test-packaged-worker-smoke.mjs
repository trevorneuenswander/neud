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

test("worker supports packaged smoke-test mode", () => {
  const worker = read("workers/data-engine/src/index.js");
  assert.match(worker, /NEUD_WORKER_SMOKE_TEST/);
  assert.match(worker, /worker-smoke-test\.ok/);
  assert.match(worker, /resolvePuppeteerBrowser/);
  assert.doesNotMatch(worker, /import dotenv from "dotenv"/);
});

test("dotenv loads only in unpackaged development", () => {
  const devEnv = read("workers/data-engine/src/dev-env.js");
  assert.match(devEnv, /NEUD_PACKAGED/);
  assert.match(devEnv, /import\("dotenv"\)/);
});

test("engine manager validates worker entry before spawn", () => {
  const engineManager = read("desktop/src/services/engine-manager.ts");
  assert.match(engineManager, /entryVerifyError/);
  assert.match(engineManager, /appendWorkerSpawnLog/);
  assert.match(engineManager, /appendEngineControlLog/);
});

test("spawn uses correct ELECTRON_RUN_AS_NODE spelling", () => {
  const processManager = read("desktop/src/services/process-manager.ts");
  assert.match(processManager, /ELECTRON_RUN_AS_NODE: "1"/);
  assert.doesNotMatch(processManager, /ELECTON_RUN_AS_NODE/);
});

test("desktop scraper controls always use IPC in desktop runtime", () => {
  const client = read("src/lib/desktop/client.ts");
  assert.match(client, /return true;/);
  assert.doesNotMatch(client, /remote-worker/);
});

test("packaged desired-state forces local-desktop execution", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /isPackagedDesktopRuntime/);
  assert.match(localData, /"local-desktop"/);
});
