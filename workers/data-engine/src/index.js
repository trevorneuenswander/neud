import fs from "fs";
import path from "path";
import { loadDevDotenv } from "./dev-env.js";
import { failAbandonedCommands } from "./commands.js";
import { getCommandStaleAfterMs, getProtocolTimeoutMs } from "./config.js";
import { runEngineLoop } from "./engine-runtime.js";
import { loadEngineBundle } from "./settings.js";
import { updateEngineStatus, writeHeartbeat } from "./heartbeat.js";
import { writeLog } from "./logs.js";
import { NEUD_PACKAGED } from "./neud-env.js";
import {
  logFirstHeartbeatSent,
  logHeartbeatRegistration,
  logWorkerBoot,
} from "./lifecycle-diagnostics.js";
import { setLifecycleActualState } from "./lifecycle-state.js";

const WORKER_VERSION = "0.1.0";

async function runWorkerSmokeTest() {
  const markerDir = process.env.NEUD_APP_DATA_DIR
    ? path.join(process.env.NEUD_APP_DATA_DIR, "logs")
    : process.cwd();
  const markerPath = path.join(markerDir, "worker-smoke-test.ok");

  const report = {
    ok: true,
    at: new Date().toISOString(),
    execPath: process.execPath,
    engineId: process.env.ENGINE_ID ?? null,
    packaged: NEUD_PACKAGED(),
    browserResolved: false,
    browserSource: null,
    browserExecutablePresent: false,
  };

  if (NEUD_PACKAGED()) {
    const { resolvePuppeteerBrowser } = await import("./browser/resolve-puppeteer-browser.js");
    const resolved = await resolvePuppeteerBrowser();
    report.browserResolved = true;
    report.browserSource = resolved.source ?? null;
    report.browserExecutablePresent = Boolean(resolved.executablePath);
  }

  fs.mkdirSync(markerDir, { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify(report, null, 2));
  console.log("[smoke-test] Worker runtime OK.");
  process.exit(0);
}

async function main() {
  await loadDevDotenv();

  if (process.env.NEUD_WORKER_SMOKE_TEST === "1") {
    try {
      await runWorkerSmokeTest();
    } catch (error) {
      console.error("[smoke-test] Failed:", error?.stack || error);
      process.exit(1);
    }
    return;
  }

  const engineId = process.env.ENGINE_ID;
  const correlationId = process.env.NEUD_ENGINE_START_CORRELATION_ID ?? null;
  const workerId =
    process.env.WORKER_ID ||
    `${process.env.HOSTNAME || "worker"}-${process.pid}`;

  if (!engineId) {
    console.error("[boot] Missing ENGINE_ID.");
    process.exit(1);
  }

  if (correlationId) {
    console.log(`[boot] correlationId=${correlationId} engineId=${engineId}`);
  }

  logWorkerBoot({ stage: "index-main", engineId, workerId, correlationId });

  if (process.env.DRY_RUN === "true") {
    console.log("[dry-run] Configuration looks valid. Exiting.");
    process.exit(0);
  }

  const bundle = await loadEngineBundle(engineId);

  if (bundle.engine.engine_type !== "webpage-scraper") {
    console.error("[boot] Only webpage-scraper engines are supported in this worker build.");
    process.exit(1);
  }

  setLifecycleActualState("starting");
  await updateEngineStatus(engineId, { actual_state: "starting" });
  logHeartbeatRegistration({ engineId, workerId, workerVersion: WORKER_VERSION });
  await writeHeartbeat(engineId, {
    workerId,
    workerVersion: WORKER_VERSION,
    pollIntervalMs: bundle.settings?.poll_interval_ms ?? 5000,
    actualState: "starting",
  });
  await writeLog(engineId, "info", "worker.connected", "Data Engine worker connected.");

  const staleCount = await failAbandonedCommands(
    engineId,
    workerId,
    getCommandStaleAfterMs(),
  );
  if (staleCount > 0) {
    console.log(`[boot] Failed ${staleCount} abandoned processing command(s).`);
  }

  console.log(
    `[boot] Worker ${workerId} running for engine ${engineId} (protocolTimeout=${getProtocolTimeoutMs()}ms)`,
  );
  await runEngineLoop({ engineId, workerId, workerVersion: WORKER_VERSION });
}

main().catch((error) => {
  console.error("[boot error]", error?.stack || error);
  process.exit(1);
});
