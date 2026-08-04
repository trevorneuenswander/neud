import dotenv from "dotenv";
import { failAbandonedCommands } from "./commands.js";
import { getCommandStaleAfterMs, getProtocolTimeoutMs } from "./config.js";
import { runEngineLoop } from "./engine-runtime.js";
import { loadEngineBundle } from "./settings.js";
import { updateEngineStatus, writeHeartbeat } from "./heartbeat.js";
import { writeLog } from "./logs.js";

dotenv.config();

const WORKER_VERSION = "0.1.0";

async function main() {
  const engineId = process.env.ENGINE_ID;
  const workerId =
    process.env.WORKER_ID ||
    `${process.env.HOSTNAME || "worker"}-${process.pid}`;

  if (!engineId) {
    console.error("[boot] Missing ENGINE_ID.");
    process.exit(1);
  }

  if (process.env.DRY_RUN === "true") {
    console.log("[dry-run] Configuration looks valid. Exiting.");
    process.exit(0);
  }

  const bundle = await loadEngineBundle(engineId);

  if (bundle.engine.engine_type !== "webpage-scraper") {
    console.error("[boot] Only webpage-scraper engines are supported in this worker build.");
    process.exit(1);
  }

  await updateEngineStatus(engineId, { actual_state: "starting" });
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

main().catch(async (error) => {
  console.error("[boot error]", error.message);
  process.exit(1);
});
