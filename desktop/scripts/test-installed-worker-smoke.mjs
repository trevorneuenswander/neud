#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { findReleaseRoots } from "./lib/release-security-scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function resolveUnpackedRoot() {
  const fromEnv = process.env.NEUD_UNPACKED_ROOT?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  for (const root of findReleaseRoots(desktopRoot)) {
    if (fs.existsSync(path.join(root, "NEUD.exe"))) {
      return root;
    }
  }
  return null;
}

test("installed worker entry and dist exist in packaged output", () => {
  const unpackedRoot = resolveUnpackedRoot();
  if (!unpackedRoot) {
    return;
  }
  const workerEntry = path.join(
    unpackedRoot,
    "resources",
    "staging",
    "worker",
    "dist",
    "boot.js",
  );
  assert.equal(fs.existsSync(workerEntry), true, "Missing staged worker dist/boot.js");
});

test("worker smoke mode writes marker file contract", () => {
  const worker = read("workers/data-engine/src/index.js");
  assert.match(worker, /NEUD_WORKER_SMOKE_TEST/);
  assert.match(worker, /worker-smoke-test\.ok/);
});

test("worker boot entry captures bootstrap import failures", () => {
  const boot = read("workers/data-engine/src/boot.js");
  assert.match(boot, /unhandledRejection/);
  assert.match(boot, /bootstrap-import/);
});

test("parent process writes worker crash diagnostics", () => {
  const engineManager = read("desktop/src/services/engine-manager.ts");
  assert.match(engineManager, /worker-crash-log/);
  assert.match(engineManager, /flushWorkerCrashExitReport/);
  assert.match(engineManager, /appendWorkerCrashStream/);
});

test("startup bootstrap log is written before services initialize", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /writeStartupBootstrapLog/);
  const bootstrap = read("desktop/src/services/startup-bootstrap-log.ts");
  assert.match(bootstrap, /startup-bootstrap\.log/);
});
