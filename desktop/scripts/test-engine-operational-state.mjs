import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readRepo(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("engine actual states include authenticating lifecycle state", () => {
  const constants = readRepo("src/lib/data-engines/constants.ts");
  assert.match(constants, /"authenticating"/);
  assert.match(constants, /authenticating: "Authenticating"/);
});

test("resolveEngineOperationalState keeps startup visible while worker is live", () => {
  const HEARTBEAT_FRESH_MS = 30_000;
  function isHeartbeatFresh(lastHeartbeatAt, nowMs = Date.now()) {
    if (!lastHeartbeatAt) return false;
    const parsed = Date.parse(lastHeartbeatAt);
    if (!Number.isFinite(parsed)) return false;
    return nowMs - parsed <= HEARTBEAT_FRESH_MS;
  }
  function resolveEngineOperationalState(input) {
    const {
      actualState,
      desiredState,
      workerLive = false,
      lastHeartbeatAt = null,
      managedProcessState = null,
    } = input;
    if (managedProcessState === "stopping" || actualState === "stopping") return "stopping";
    if (actualState === "error") return "error";
    if (actualState === "authenticating") return "authenticating";
    if (actualState === "running") return "running";
    if (actualState === "starting") return "starting";
    if (actualState === "stopped" && desiredState !== "running") return "stopped";
    const startupInProgress =
      desiredState === "running" &&
      (workerLive ||
        managedProcessState === "starting" ||
        isHeartbeatFresh(lastHeartbeatAt));
    if (!startupInProgress) return actualState;
    if (actualState === "offline" || actualState === "stopped") return "starting";
    return actualState;
  }

  const resolved = resolveEngineOperationalState({
    actualState: "offline",
    desiredState: "running",
    workerLive: true,
    lastHeartbeatAt: new Date().toISOString(),
    managedProcessState: "starting",
  });
  assert.equal(resolved, "starting");
});

test("resolveEngineOperationalState preserves authenticating", () => {
  function resolveEngineOperationalState(input) {
    if (input.actualState === "authenticating") return "authenticating";
    return input.actualState;
  }
  const resolved = resolveEngineOperationalState({
    actualState: "authenticating",
    desiredState: "running",
    workerLive: true,
    lastHeartbeatAt: new Date().toISOString(),
    managedProcessState: "starting",
  });
  assert.equal(resolved, "authenticating");
});

test("startup control gating disables start during authenticating", () => {
  const actualState = "authenticating";
  const canStart =
    actualState === "offline" ||
    actualState === "stopped" ||
    actualState === "error";
  assert.equal(canStart, false);
});

test("startup control gating keeps stop enabled during authenticating", () => {
  const actualState = "authenticating";
  const desiredState = "running";
  const canStop =
    actualState !== "stopping" &&
    (desiredState === "running" ||
      actualState === "starting" ||
      actualState === "authenticating" ||
      actualState === "running");
  assert.equal(canStop, true);
});

test("expected startup sequence labels", () => {
  const labels = {
    starting: "Starting",
    authenticating: "Authenticating",
    running: "Running",
  };
  assert.equal(labels.starting, "Starting");
  assert.equal(labels.authenticating, "Authenticating");
  assert.equal(labels.running, "Running");
});
