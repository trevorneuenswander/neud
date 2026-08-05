import {
  claimNextCommand,
  failAbandonedCommands,
  finalizeCommandFailure,
  finalizeCommandSuccess,
} from "./commands.js";
import { getCommandStaleAfterMs } from "./config.js";
import { getErrorStep, isProtocolTimeout, sanitizeError } from "./errors.js";
import {
  recordRunFailure,
  recordRunSuccess,
  updateEngineStatus,
  writeHeartbeat,
} from "./heartbeat.js";
import { writeLog, pruneLogs } from "./logs.js";
import { logBagDiagnostic, logBagDiagnosticError, formatStageFailure } from "./bag-diagnostics.js";
import {
  claimExportCurrentAuction,
  completeExportCurrentAuction,
  consumeRunOnce,
  failExportCurrentAuction,
  isExportCancelled,
  isLocalApiEnabled,
  reportExportProgress,
  reportExportStarted,
} from "./local-client.js";
import { loadEngineBundle } from "./settings.js";
import { writeSnapshot } from "./snapshots.js";
import { getAdapter } from "./adapters/registry.js";
import {
  logWorkerDesiredStateObserved,
  logWorkerPollWaitInterrupted,
  logWorkerShutdownInitiated,
  logWorkerSigtermReceived,
} from "./lifecycle-diagnostics.js";
import {
  getLifecycleActualState,
  setLifecycleActualState,
} from "./lifecycle-state.js";

async function recoverFromBrowserFailure(engineId, adapter, error, step) {
  const message = sanitizeError(error);
  const protocolTimeout = isProtocolTimeout(error);

  if (protocolTimeout) {
    await writeLog(engineId, "error", "browser.protocol_timeout", message, {
      step,
    }).catch(() => {});
  }

  let recovered = false;

  if (adapter?.recoverBrowser) {
    try {
      await adapter.recoverBrowser();
      recovered = true;
    } catch (recoveryError) {
      console.error(
        "[runtime] Browser recovery failed:",
        sanitizeError(recoveryError),
      );
    }
  } else if (adapter?.stop) {
    try {
      await adapter.stop();
      recovered = true;
    } catch (recoveryError) {
      console.error(
        "[runtime] Browser stop during recovery failed:",
        sanitizeError(recoveryError),
      );
    }
  }

  return recovered;
}

function resolveActualStateAfterFailure(desiredState, recovered) {
  if (recovered && desiredState === "stopped") {
    return "stopped";
  }

  return "error";
}

export async function runEngineLoop({ engineId, workerId, workerVersion }) {
  let adapter = null;
  let running = true;
  let shuttingDown = false;
  let shutdownPromise = null;
  let runOnceRequested = false;
  let pendingRunOnceCommandId = null;
  let actualState = getLifecycleActualState();
  let activeScrapePromise = null;
  let exportPollTimer = null;

  function startExportPollingDuringScrape() {
    if (exportPollTimer) return;
    exportPollTimer = setInterval(() => {
      void processPendingExportCommand();
    }, 1500);
  }

  function stopExportPollingDuringScrape() {
    if (!exportPollTimer) return;
    clearInterval(exportPollTimer);
    exportPollTimer = null;
  }
  let activeExportPromise = null;
  let exportAbortRequested = false;
  const staleAfterMs = getCommandStaleAfterMs();
  const SHUTDOWN_SCRAPE_WAIT_MS = 5000;
  const SHUTDOWN_EXPORT_WAIT_MS = 2000;

  async function initiateShutdown() {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shuttingDown = true;
    running = false;
    exportAbortRequested = true;
    logWorkerShutdownInitiated({ reason: "engine-runtime.initiateShutdown" });

    shutdownPromise = (async () => {
      await writeLog(engineId, "info", "engine.execution", "Polling timer cleared").catch(
        () => {},
      );

      if (activeExportPromise) {
        await writeLog(
          engineId,
          "info",
          "engine.execution",
          "Waiting for active export to stop",
        ).catch(() => {});
        await Promise.race([
          activeExportPromise.catch(() => {}),
          new Promise((resolve) => {
            setTimeout(resolve, SHUTDOWN_EXPORT_WAIT_MS);
          }),
        ]);
      }

      if (activeScrapePromise) {
        await writeLog(
          engineId,
          "info",
          "engine.execution",
          "Waiting for active scrape to stop",
        ).catch(() => {});
        await Promise.race([
          activeScrapePromise.catch(() => {}),
          new Promise((resolve) => {
            setTimeout(resolve, SHUTDOWN_SCRAPE_WAIT_MS);
          }),
        ]);
      }

      if (adapter?.stop) {
        await writeLog(
          engineId,
          "info",
          "engine.execution",
          "Closing scraper browser",
        ).catch(() => {});
        try {
          await adapter.stop();
        } catch (error) {
          console.error(
            "[runtime] Adapter shutdown failed:",
            sanitizeError(error),
          );
        }
      }
      adapter = null;
    })();

    return shutdownPromise;
  }

  process.on("SIGINT", () => {
    logWorkerSigtermReceived({ signal: "SIGINT" });
    void initiateShutdown();
  });
  process.on("SIGTERM", () => {
    logWorkerSigtermReceived({ signal: "SIGTERM" });
    void initiateShutdown();
  });

  await failAbandonedCommands(engineId, workerId, staleAfterMs);

  async function processCommand(commandRow) {
    const { command_id: commandId, command } = commandRow;

    try {
      const bundle = await loadEngineBundle(engineId);
      adapter = getAdapter(bundle.engine);

      if (command === "start" || command === "restart") {
        actualState = "starting";
        setLifecycleActualState("starting");
        await updateEngineStatus(engineId, { actual_state: "starting" });
        if (command === "restart" && adapter.restart) {
          await adapter.restart(bundle);
        } else {
          await adapter.start(bundle);
        }
        actualState = "running";
        await writeLog(engineId, "info", "command.completed", "Engine started.");
        await finalizeCommandSuccess(commandId);
        return;
      }

      if (command === "stop") {
        actualState = "stopping";
        await updateEngineStatus(engineId, { actual_state: "stopping" });
        if (adapter?.stop) await adapter.stop();
        adapter = null;
        actualState = "stopped";
        await writeLog(engineId, "info", "command.completed", "Engine stopped.");
        await finalizeCommandSuccess(commandId);
        return;
      }

      if (command === "run_once") {
        runOnceRequested = true;
        pendingRunOnceCommandId = commandId;
        await writeLog(
          engineId,
          "info",
          "command.accepted",
          "Run once accepted; scrape will start on the next loop.",
        );
        return;
      }

      if (command === "export_current_auction") {
        await writeLog(
          engineId,
          "info",
          "command.accepted",
          "Export current auction accepted.",
        );
        await finalizeCommandSuccess(commandId);
        return;
      }

      await finalizeCommandFailure(commandId, new Error(`Unknown command: ${command}`));
    } catch (error) {
      const step = getErrorStep(error);
      const message = await finalizeCommandFailure(commandId, error);
      const recovered = await recoverFromBrowserFailure(
        engineId,
        adapter,
        error,
        step,
      );

      if (recovered) {
        adapter = null;
      }

      actualState = resolveActualStateAfterFailure(
        (await loadEngineBundle(engineId)).engine.desired_state,
        recovered,
      );

      await updateEngineStatus(engineId, {
        actual_state: actualState,
        last_error: message,
        health_state: actualState === "error" ? "error" : "warning",
      }).catch(() => {});

      await writeLog(engineId, "error", "command.failed", message, {
        step,
        protocolTimeout: isProtocolTimeout(error),
      }).catch(() => {});
    }
  }

  async function finalizeRunOnceCommand(error) {
    if (!pendingRunOnceCommandId) return;

    const commandId = pendingRunOnceCommandId;
    pendingRunOnceCommandId = null;

    if (error) {
      await finalizeCommandFailure(commandId, error);
      return;
    }

    await finalizeCommandSuccess(commandId);
  }

  async function processPendingExportCommand() {
    if (activeExportPromise || shuttingDown || !isLocalApiEnabled()) {
      return;
    }

    const exportCommand = await claimExportCurrentAuction(engineId);
    if (!exportCommand) {
      return;
    }

    activeExportPromise = (async () => {
      exportAbortRequested = false;
      let cancelFlag = false;
      const pollCancelState = () => {
        void isExportCancelled(exportCommand.requestId)
          .then((cancelled) => {
            cancelFlag = cancelled;
            if (cancelled) {
              exportAbortRequested = true;
            }
          })
          .catch(() => {});
      };
      pollCancelState();
      const cancelPollTimer = setInterval(pollCancelState, 500);

      await writeLog(
        engineId,
        "info",
        "engine.execution",
        "Export current auction started",
      );

      try {
        const bundle = await loadEngineBundle(engineId);
        if (!adapter) {
          adapter = getAdapter(bundle.engine);
          await adapter.start(bundle);
        }

        await reportExportStarted(exportCommand.requestId, {
          workerId,
          operationId: exportCommand.operationId,
          projectId: exportCommand.projectId,
        });

        const reportProgress = async (progress) => {
          try {
            await reportExportProgress(exportCommand.requestId, {
              workerId,
              operationId: exportCommand.operationId,
              totalLots: exportCommand.tasks.length,
              ...progress,
            });
          } catch {
            // Progress reporting must not interrupt export work.
          }
        };

        const formatCount = (value) => Number(value ?? 0).toLocaleString("en-US");

        const result = await adapter.exportLotDetails(bundle, exportCommand.tasks, {
          photoDownloadRoot: exportCommand.photoDownloadRoot,
          shouldAbort: () => shuttingDown || exportAbortRequested || cancelFlag,
          onLotProgress: (event) => {
            const metadataComplete =
              event.stage === "lot-complete" || event.stage === "metadata-complete";
            void reportProgress({
              progressPhase: "metadata",
              completedMetadataLots: metadataComplete
                ? event.current
                : Math.max(0, event.current - 1),
              totalLots: event.total,
              currentLotNumber: event.lotNumber,
              message: `Reading details for Lot ${event.lotNumber} — ${event.current} of ${event.total}`,
            });
          },
          onMetadataComplete: ({ totalPhotos, totalLots }) => {
            void reportProgress({
              progressPhase: "photos",
              totalPhotos,
              totalLots,
              completedPhotos: 0,
              message:
                totalPhotos > 0
                  ? `Downloading photo 1 of ${formatCount(totalPhotos)}`
                  : "Preparing photo downloads…",
            });
          },
          onPhotoProgress: (event) => {
            void reportProgress({
              progressPhase: "photos",
              completedPhotos: event.completedPhotos ?? event.photoIndex,
              totalPhotos: event.totalPhotos ?? event.photoTotal,
              currentLotNumber: event.lotNumber,
              currentPhotoIndex: event.photoIndex,
              message: `Downloading photo ${formatCount(event.completedPhotos ?? event.photoIndex)} of ${formatCount(event.totalPhotos ?? event.photoTotal)} — Lot ${event.lotNumber}`,
            });
          },
        });

        if (result?.cancelled) {
          await failExportCurrentAuction(
            exportCommand.requestId,
            "Export cancelled.",
            {
              workerId,
              operationId: exportCommand.operationId,
            },
          );
          await writeLog(
            engineId,
            "info",
            "engine.execution",
            "Export current auction cancelled",
          );
          return;
        }

        await completeExportCurrentAuction(exportCommand.requestId, result, {
          workerId,
          operationId: exportCommand.operationId,
        });
        await writeLog(
          engineId,
          "info",
          "engine.execution",
          "Export current auction completed",
        );
      } catch (error) {
        const message = sanitizeError(error);
        await failExportCurrentAuction(exportCommand.requestId, message, {
          workerId,
          operationId: exportCommand.operationId,
        });
        await writeLog(
          engineId,
          "error",
          "engine.execution",
          `Export current auction failed: ${message}`,
        );
      } finally {
        clearInterval(cancelPollTimer);
        activeExportPromise = null;
      }
    })();
  }

  while (running) {
    const loopStart = Date.now();

    try {
      if (shuttingDown) {
        logWorkerPollWaitInterrupted({
          engineId,
          reason: "loop-shutting-down",
          actualState,
        });
        break;
      }

      await failAbandonedCommands(engineId, workerId, staleAfterMs);

      if (isLocalApiEnabled()) {
        const pending = await consumeRunOnce(engineId);
        if (pending) {
          runOnceRequested = true;
        }
      }

      const claimed = await claimNextCommand(engineId, workerId);
      if (claimed) {
        await processCommand(claimed);
      }

      void processPendingExportCommand();

      const bundle = await loadEngineBundle(engineId);
      const pollIntervalMs = bundle.settings?.poll_interval_ms ?? 5000;
      const desiredState = bundle.engine.desired_state;
      logWorkerDesiredStateObserved({
        engineId,
        desiredState,
        actualState,
        source: "engine-runtime.loop",
      });

      await writeHeartbeat(engineId, {
        workerId,
        workerVersion,
        pollIntervalMs,
        actualState: getLifecycleActualState(),
      });

      const shouldRun =
        !shuttingDown && (runOnceRequested || desiredState === "running");

      if (shouldRun && bundle.engine.engine_type === "webpage-scraper") {
        if (shuttingDown) {
          break;
        }

        if (!adapter) {
          adapter = getAdapter(bundle.engine);
          actualState = "starting";
          setLifecycleActualState("starting");
          await updateEngineStatus(engineId, { actual_state: "starting" });
          await adapter.start(bundle);
          actualState = getLifecycleActualState();
          void processPendingExportCommand();
        }

        bundle.pendingRunOnce = runOnceRequested;

        const startedAt = new Date().toISOString();
        await logBagDiagnostic(engineId, "engine.start", "Starting engine", {
          runType: runOnceRequested ? "run_once" : "automatic",
        });

        await updateEngineStatus(engineId, {
          actual_state: actualState,
          last_run_started_at: startedAt,
        });

        try {
          if (shuttingDown) {
            await finalizeRunOnceCommand(null);
            break;
          }

          activeScrapePromise = adapter.scrapeOnce(bundle);
          startExportPollingDuringScrape();
          const data = await activeScrapePromise;
          stopExportPollingDuringScrape();
          activeScrapePromise = null;

          if (shuttingDown) {
            await finalizeRunOnceCommand(null);
            break;
          }

          const durationMs = Date.now() - loopStart;
          const payload = JSON.stringify(data);
          const runMetadata =
            typeof adapter.getLastRunMetadata === "function"
              ? adapter.getLastRunMetadata()
              : null;
          if (runMetadata) {
            runMetadata.durationMs = durationMs;
            runMetadata.runType = runOnceRequested ? "run_once" : "automatic";
          }
          const recordCount = Array.isArray(data.lots)
            ? data.lots.length
            : data?.adapter === "generic-webpage"
              ? Object.keys(data.values ?? {}).length
              : null;

          if (shuttingDown) {
            await finalizeRunOnceCommand(null);
            break;
          }

          await writeSnapshot(engineId, data, {
            recordCount,
            durationMs,
            workerId,
          });
          await logBagDiagnostic(engineId, "snapshot.write", "Snapshot written", {
            recordCount,
            durationMs,
            payloadSizeBytes: Buffer.byteLength(payload, "utf8"),
          });
          await recordRunSuccess(engineId, {
            actualState: runOnceRequested && desiredState === "stopped" ? "stopped" : "running",
            startedAt,
            durationMs,
            recordCount,
            payloadSizeBytes: Buffer.byteLength(payload, "utf8"),
          });
          const recordSummary =
            data?.adapter === "generic-webpage"
              ? `${Object.keys(data.values ?? {}).length} fields extracted.`
              : `${Array.isArray(data.lots) ? data.lots.length : 0} records parsed.`;
          await writeLog(
            engineId,
            "info",
            "scrape.completed",
            recordSummary,
            runMetadata ?? { durationMs },
          );
          await logBagDiagnostic(engineId, "pipeline.complete", "Completed successfully", {
            runType: runOnceRequested ? "run_once" : "automatic",
            durationMs,
          });
          await finalizeRunOnceCommand(null);

          if (runOnceRequested && desiredState === "stopped") {
            if (adapter?.stop) await adapter.stop();
            adapter = null;
            actualState = "stopped";
            await updateEngineStatus(engineId, { actual_state: "stopped" });
          } else {
            actualState = "running";
            setLifecycleActualState("running");
          }
        } catch (error) {
          stopExportPollingDuringScrape();
          activeScrapePromise = null;
          if (shuttingDown) {
            actualState = "stopped";
            await updateEngineStatus(engineId, {
              actual_state: "stopped",
              health_state: "warning",
            }).catch(() => {});
            await finalizeRunOnceCommand(null);
            break;
          }

          const step = getErrorStep(error);
          const message = sanitizeError(error);
          const failureMessage = step ? formatStageFailure(step, message) : message;
          const recovered = await recoverFromBrowserFailure(
            engineId,
            adapter,
            error,
            step,
          );

          if (recovered) {
            adapter = null;
          }

          actualState = resolveActualStateAfterFailure(desiredState, recovered);

          await recordRunFailure(engineId, {
            actualState,
            startedAt,
            errorMessage: failureMessage,
          }).catch(() => {});

          await writeLog(engineId, "error", "scrape.failed", failureMessage, {
            step,
            protocolTimeout: isProtocolTimeout(error),
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - loopStart,
            runType: runOnceRequested ? "run_once" : "automatic",
            error: message,
          }).catch(() => {});

          await logBagDiagnosticError(
            engineId,
            step || "scrape.failed",
            failureMessage,
            {
              protocolTimeout: isProtocolTimeout(error),
              runType: runOnceRequested ? "run_once" : "automatic",
            },
          ).catch(() => {});

          await finalizeRunOnceCommand(error);

          await updateEngineStatus(engineId, {
            actual_state: actualState,
            last_error: failureMessage,
            health_state: actualState === "error" ? "error" : "warning",
          }).catch(() => {});
        } finally {
          runOnceRequested = false;
        }
      } else if (desiredState === "stopped" && actualState === "running") {
        logWorkerDesiredStateObserved({
          engineId,
          desiredState,
          actualState: "running",
          source: "engine-runtime.stop-due-to-desired-state",
        });
        if (adapter?.stop) await adapter.stop();
        adapter = null;
        actualState = "stopped";
        await updateEngineStatus(engineId, { actual_state: "stopped" });
      }

      await pruneLogs(engineId, 500);

      if (shuttingDown) {
        break;
      }

      const pollCompletedAt = Date.now();
      await waitUntilNextPoll(
        engineId,
        pollCompletedAt,
        pollIntervalMs,
        () => running && !shuttingDown,
      );
    } catch (error) {
      if (shuttingDown) {
        break;
      }

      const message = sanitizeError(error);
      await writeLog(engineId, "error", "runtime.failed", message).catch(() => {});
      actualState = "error";
      await updateEngineStatus(engineId, {
        actual_state: "error",
        last_error: message,
        health_state: "error",
      }).catch(() => {});
      await finalizeRunOnceCommand(error);
      runOnceRequested = false;
      await interruptibleSleep(5000, () => running && !shuttingDown);
    }
  }

  await initiateShutdown();
  await updateEngineStatus(engineId, { actual_state: "stopped" });
}

function interruptibleSleep(ms, shouldContinue) {
  return new Promise((resolve) => {
    if (ms <= 0 || !shouldContinue()) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      if (!shouldContinue() || Date.now() - startedAt >= ms) {
        resolve();
        return;
      }

      setTimeout(tick, Math.min(200, ms));
    };

    setTimeout(tick, Math.min(200, ms));
  });
}

async function waitUntilNextPoll(
  engineId,
  pollCompletedAt,
  initialIntervalMs,
  shouldContinue,
) {
  let activeIntervalMs = initialIntervalMs;

  while (shouldContinue()) {
    const bundle = await loadEngineBundle(engineId);
    const configuredIntervalMs = bundle.settings?.poll_interval_ms ?? 5000;

    if (configuredIntervalMs !== activeIntervalMs) {
      await writeLog(
        engineId,
        "info",
        "engine.execution",
        formatPollingIntervalChangeMessage(configuredIntervalMs),
      ).catch(() => {});
      activeIntervalMs = configuredIntervalMs;
    }

    const remainingMs = pollCompletedAt + activeIntervalMs - Date.now();
    if (remainingMs <= 0) {
      return;
    }

    await interruptibleSleep(Math.min(200, remainingMs), shouldContinue);
  }
}

function formatPollingIntervalChangeMessage(intervalMs) {
  const totalSeconds = intervalMs / 1000;

  if (totalSeconds === 1) {
    return "Polling interval changed to 1 second";
  }

  if (totalSeconds < 60) {
    const label = Number.isInteger(totalSeconds)
      ? String(totalSeconds)
      : String(totalSeconds);
    return `Polling interval changed to ${label} seconds`;
  }

  const minutes = totalSeconds / 60;
  if (minutes === 1) {
    return "Polling interval changed to 1 minute";
  }

  if (Number.isInteger(minutes)) {
    return `Polling interval changed to ${minutes} minutes`;
  }

  const wholeMinutes = Math.floor(minutes);
  const seconds = Math.round(totalSeconds - wholeMinutes * 60);
  if (seconds === 0) {
    return wholeMinutes === 1
      ? "Polling interval changed to 1 minute"
      : `Polling interval changed to ${wholeMinutes} minutes`;
  }

  const minuteLabel =
    wholeMinutes === 1 ? "1 minute" : `${wholeMinutes} minutes`;
  const secondLabel = seconds === 1 ? "1 second" : `${seconds} seconds`;
  return `Polling interval changed to ${minuteLabel} ${secondLabel}`;
}
