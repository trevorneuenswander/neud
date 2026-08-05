#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

test("worker lifecycle diagnostics module captures stack traces for sigterm", () => {
  const source = fs.readFileSync(
    path.join(desktopRoot, "src", "services", "worker-lifecycle-diagnostics.ts"),
    "utf8",
  );
  assert.match(source, /worker-lifecycle\.log/);
  assert.match(source, /captureLifecycleStackTrace/);
  assert.match(source, /logWorkerSigtermInitiated/);
  assert.match(source, /logEngineManagerStopRequested/);
});

test("process manager logs sigterm initiation with stack trace", () => {
  const source = fs.readFileSync(
    path.join(desktopRoot, "src", "services", "process-manager.ts"),
    "utf8",
  );
  assert.match(source, /logWorkerSigtermInitiated/);
  assert.match(source, /child\.kill\("SIGTERM"\)/);
});

test("engine manager logs start and stop lifecycle timeline events", () => {
  const source = fs.readFileSync(
    path.join(desktopRoot, "src", "services", "engine-manager.ts"),
    "utf8",
  );
  assert.match(source, /start-button-pressed/);
  assert.match(source, /worker-spawned/);
  assert.match(source, /logEngineManagerStopRequested/);
  assert.match(source, /worker-exited-after-sigterm/);
});

test("worker lifecycle diagnostics exist in worker source", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "workers", "data-engine", "src", "lifecycle-diagnostics.js"),
    "utf8",
  );
  assert.match(source, /worker-boot/);
  assert.match(source, /first-heartbeat-sent/);
  assert.match(source, /sigterm-received/);
  assert.match(source, /first-local-api-request/);
});

test("local data service logs desired-state transitions and heartbeat receipt", () => {
  const source = fs.readFileSync(
    path.join(desktopRoot, "src", "services", "local-data-service.ts"),
    "utf8",
  );
  assert.match(source, /logDesiredStateTransition/);
  assert.match(source, /logHeartbeatReceivedByParent/);
});
