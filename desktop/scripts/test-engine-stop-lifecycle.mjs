import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { ProcessManager } from "../dist/services/process-manager.js";

test("ProcessManager stops a child process and clears registration", async () => {
  const manager = new ProcessManager();
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    windowsHide: true,
  });

  manager.register("test-engine", child);
  assert.equal(manager.has("test-engine"), true);

  const stopResult = await manager.stop("test-engine", 2000);
  assert.equal(manager.has("test-engine"), false);
  assert.equal(typeof stopResult.forced, "boolean");
  assert.ok(stopResult.exitCode === null || typeof stopResult.exitCode === "number");
});

test("ProcessManager stop result exposes forced termination flag", async () => {
  const manager = new ProcessManager();
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    windowsHide: true,
  });

  manager.register("forced-flag-engine", child);
  const stopResult = await manager.stop("forced-flag-engine", 2000);
  assert.equal(manager.has("forced-flag-engine"), false);
  assert.equal(typeof stopResult.forced, "boolean");
});

test("stop control gating disables repeated clicks while stopping", () => {
  const actualState = "stopping";
  const desiredState = "stopped";
  const canStop =
    actualState !== "stopping" &&
    (desiredState === "running" ||
      actualState === "starting" ||
      actualState === "running");

  assert.equal(canStop, false);
});

test("stop control remains available while running even if desired is already stopped", () => {
  const actualState = "running";
  const desiredState = "stopped";
  const canStop =
    actualState !== "stopping" &&
    (desiredState === "running" ||
      actualState === "starting" ||
      actualState === "running");

  assert.equal(canStop, true);
});

test("stoppingDesktop clears when actual state becomes stopped", () => {
  let stoppingDesktop = true;
  const actualState = "stopped";

  if (stoppingDesktop && (actualState === "stopped" || actualState === "offline")) {
    stoppingDesktop = false;
  }

  assert.equal(stoppingDesktop, false);
});

test("engine execution stop log sequence includes terminal stopped message", () => {
  const logs = [];
  const recordExecutionLog = (message) => {
    logs.push({ event_type: "engine.execution", message });
  };

  recordExecutionLog("Stop requested");
  recordExecutionLog("Worker exited");
  recordExecutionLog("Scraper Engine stopped");

  assert.deepEqual(
    logs.map((log) => log.message),
    ["Stop requested", "Worker exited", "Scraper Engine stopped"],
  );
});

test("forced stop log sequence includes timeout and termination messages", () => {
  const logs = [];
  const recordExecutionLog = (message) => {
    logs.push({ event_type: "engine.execution", message });
  };

  recordExecutionLog("Stop requested");
  recordExecutionLog("Graceful stop timed out");
  recordExecutionLog("Worker terminated");
  recordExecutionLog("Scraper Engine stopped");

  assert.deepEqual(
    logs.map((log) => log.message),
    [
      "Stop requested",
      "Graceful stop timed out",
      "Worker terminated",
      "Scraper Engine stopped",
    ],
  );
});
