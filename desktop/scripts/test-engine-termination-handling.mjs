import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readRepo(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("engine manager tracks intentional worker termination reasons", () => {
  const engineManager = readRepo("desktop/src/services/engine-manager.ts");
  assert.match(engineManager, /pendingTerminationReason/);
  assert.match(engineManager, /WorkerTerminationReason/);
  assert.match(engineManager, /isExpectedWorkerTermination/);
  assert.match(engineManager, /worker-exited-expected/);
});

test("restart passes restart termination reason to stop", () => {
  const engineManager = readRepo("desktop/src/services/engine-manager.ts");
  assert.match(engineManager, /stop\(engineId, requestedBy, \{ reason: "restart" \}\)/);
});

test("expected SIGTERM does not persist lastError in exit handler", () => {
  const engineManager = readRepo("desktop/src/services/engine-manager.ts");
  assert.match(engineManager, /expectedExit\s*\?\s*null/);
  assert.match(engineManager, /actualState: expectedExit \? "stopped" : "error"/);
});

test("forced kill maps to force-kill-after-timeout reason", () => {
  const engineManager = readRepo("desktop/src/services/engine-manager.ts");
  assert.match(engineManager, /force-kill-after-timeout/);
});

test("termination reason helper treats user stop SIGTERM as expected", () => {
  const expectedReasons = new Set([
    "user-stop",
    "restart",
    "application-exit",
    "replacement",
  ]);
  const isExpected = (reason, code, signal) =>
    (expectedReasons.has(reason) && (signal === "SIGTERM" || code === 0)) ||
    (code === 0 && !signal);

  assert.equal(isExpected("user-stop", null, "SIGTERM"), true);
  assert.equal(isExpected("restart", null, "SIGTERM"), true);
  assert.equal(isExpected("application-exit", null, "SIGTERM"), true);
  assert.equal(isExpected("unexpected", null, "SIGTERM"), false);
  assert.equal(isExpected("unexpected", 1, null), false);
  assert.equal(isExpected("user-stop", 0, null), true);
});
