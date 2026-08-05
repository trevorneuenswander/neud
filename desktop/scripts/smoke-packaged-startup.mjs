#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findReleaseRoots } from "./lib/release-security-scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

const unpackedRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : findReleaseRoots(desktopRoot)[0] ?? null;

assert.ok(unpackedRoot, "Build with npm run package:win first.");

const executable = path.join(unpackedRoot, "NEUD.exe");
assert.equal(fs.existsSync(executable), true, "Missing NEUD.exe");

if (process.platform === "win32") {
  try {
    execSync(
      'powershell -NoProfile -Command "Get-Process NEUD -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"',
      { stdio: "ignore" },
    );
  } catch {
    // no running NEUD process
  }
}

const logDir = path.join(process.env.APPDATA ?? "", "NEUD", "logs");
const startupLog = path.join(logDir, "startup.log");
const bootstrapLog = path.join(logDir, "bootstrap.log");
const startupReadyLog = path.join(logDir, "startup-ready.json");
const testStartedAt = Date.now();

if (fs.existsSync(startupReadyLog)) {
  fs.rmSync(startupReadyLog, { force: true });
}

const logOffset = fs.existsSync(startupLog) ? fs.statSync(startupLog).size : 0;
const bootstrapOffset = fs.existsSync(bootstrapLog) ? fs.statSync(bootstrapLog).size : 0;

function isNeudProcessRunning() {
  if (process.platform !== "win32") {
    return child.exitCode === null;
  }

  try {
    execSync('powershell -NoProfile -Command "(Get-Process NEUD -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0"', {
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function stopPackagedNeud() {
  if (process.platform !== "win32") {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
    return;
  }

  try {
    execSync(
      'powershell -NoProfile -Command "Get-Process NEUD -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"',
      { stdio: "ignore" },
    );
  } catch {
    // ignore
  }
}

const child = spawn(executable, [], {
  cwd: path.dirname(executable),
  detached: process.platform === "win32",
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

if (child.unref) {
  child.unref();
}

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8");
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

const failureMarkers = [
  /A JavaScript error occurred in the main process/i,
  /Cannot find module/i,
  /ENOENT: no such file or directory/i,
  /UnhandledPromiseRejection/i,
  /uncaughtException/i,
];

function assertNoStartupFailure(output) {
  for (const marker of failureMarkers) {
    assert.doesNotMatch(output, marker, `Startup failure marker detected: ${marker}`);
  }
}

async function probeHealth(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    if (response.ok) {
      return true;
    }
  } catch {
    // retry
  }
  return false;
}

async function waitForHealth(timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(startupReadyLog)) {
      try {
        const ready = JSON.parse(fs.readFileSync(startupReadyLog, "utf8"));
        const readyAt = Date.parse(String(ready?.at ?? ""));
        if (
          ready?.ready === true &&
          Number.isFinite(readyAt) &&
          readyAt >= testStartedAt - 1000
        ) {
          return { port: null, surface: "startup-ready", readyAt };
        }
      } catch {
        // retry
      }
    }

    if (await probeHealth("http://127.0.0.1:8070")) {
      return { port: 8070, surface: "local-api" };
    }

    for (let port = 45123; port <= 45133; port += 1) {
      const reachable = await isPortListening(port);
      if (!reachable) {
        continue;
      }
      if (await probeHealth(`http://127.0.0.1:${port}`)) {
        return { port, surface: "next" };
      }
    }

    if (!isNeudProcessRunning()) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return null;
}

function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

const health = await waitForHealth();
const combinedOutput = `${stdout}\n${stderr}`;
assertNoStartupFailure(combinedOutput);

if (!health && !isNeudProcessRunning()) {
  const bootstrapTail = fs.existsSync(bootstrapLog)
    ? fs.readFileSync(bootstrapLog, "utf8").slice(bootstrapOffset)
    : "";
  assert.fail(`NEUD exited before health became ready.\n${combinedOutput}\n${bootstrapTail}`);
}
assert.ok(
  health,
  `Local health endpoint did not become ready.\n${combinedOutput}${
    fs.existsSync(startupLog)
      ? `\nstartup.log:\n${fs.readFileSync(startupLog, "utf8").slice(logOffset)}`
      : ""
  }${
    fs.existsSync(bootstrapLog)
      ? `\nbootstrap.log:\n${fs.readFileSync(bootstrapLog, "utf8").slice(bootstrapOffset)}`
      : ""
  }`,
);

if (fs.existsSync(startupLog)) {
  const newLog = fs.readFileSync(startupLog, "utf8").slice(logOffset);
  assert.match(newLog, /startup\.(local_api_ready|next_server_ready|main_window_ready)/);
  assert.doesNotMatch(newLog, /startup\.failure/);
}

if (fs.existsSync(startupReadyLog)) {
  const ready = JSON.parse(fs.readFileSync(startupReadyLog, "utf8"));
  assert.equal(ready.ready, true);
  const readyAt = Date.parse(String(ready.at ?? ""));
  assert.ok(
    Number.isFinite(readyAt) && readyAt >= testStartedAt - 1000,
    "startup-ready.json must be newly written for this smoke test run",
  );
}

stopPackagedNeud();
await new Promise((resolve) => setTimeout(resolve, 2000));

console.log(
  JSON.stringify(
    {
      ok: true,
      unpackedRoot,
      health,
      startupLog,
    },
    null,
    2,
  ),
);
