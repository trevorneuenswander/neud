"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, startTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { NeudModal } from "@/components/ui/NeudModal";
import { EngineStateInlineAlert, EngineStatePanel } from "@/components/data-engines/webpage-scraper/EngineStatePanel";
import {
  failStaleEngineCommand,
  sendEngineCommand,
} from "@/lib/data-engines/actions";
import {
  getEngineControlState,
  isBroadArrowConfigurationError,
  type ControlButtonState,
} from "@/lib/data-engines/control-state";
import { getActiveCommandMessage, isCommandStale } from "@/lib/data-engines/command-utils";
import type { EngineActualState, EngineCommand } from "@/lib/data-engines/constants";
import { initialDataEngineActionState } from "@/lib/data-engines/state";
import type { DataEngineCommand, DataEngineLog, DataEngineStatus } from "@/lib/data-engines/types";
import type { DataEngine } from "@/lib/data-engines/types";
import { getRunOnceStageFromLogs } from "@/lib/data-engines/bag-diagnostic-log";
import { controlDesktopEngine, shouldUseLocalDesktopEngine } from "@/lib/desktop/client";
import {
  cancelCurrentWebpageDownload,
  getWebpageExportOperation,
  subscribeToWebpageExportOperations,
} from "@/lib/desktop/webpage-export-client";
import { isActiveWebpageExportStatus } from "@/lib/desktop/webpage-export-types";
import { createClient } from "@/lib/supabase/client";

type RunOncePhase =
  | "starting"
  | "scraping"
  | "writing-snapshot"
  | "updating-live-state"
  | "complete"
  | "failed";

const RUN_ONCE_PHASE_LABELS: Record<RunOncePhase, string> = {
  starting: "Starting",
  scraping: "Scraping",
  "writing-snapshot": "Writing snapshot",
  "updating-live-state": "Updating live state",
  complete: "Complete",
  failed: "Failed",
};

type EngineControlsProps = {
  projectId?: string;
  projectSlug: string;
  engine: DataEngine;
  actualState: EngineActualState;
  desiredState: "running" | "stopped";
  canControl: boolean;
  activeCommand: DataEngineCommand | null;
  canRecoverStaleCommand?: boolean;
  status?: DataEngineStatus | null;
  logs?: DataEngineLog[];
  onRefresh?: () => void;
  suppressConfigurationErrors?: boolean;
  layout?: "default" | "inline-state";
  stateStatusDetail?: ReactNode;
  operationalError?: string | null;
  realtimeDisconnected?: boolean;
  showNotificationArea?: boolean;
};

type ScraperInterruptDialog = {
  command: "stop" | "restart";
  operationId: string;
};

function DesktopControlButton({
  label,
  variant = "primary",
  disabled,
  reason,
  onClick,
}: {
  label: string;
  variant?: "primary" | "secondary";
  disabled: boolean;
  reason: string | null;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={disabled}
      title={reason ?? undefined}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function ServerControlButton({
  label,
  variant = "primary",
  command,
  projectSlug,
  engineId,
  formAction,
  state,
}: {
  label: string;
  variant?: "primary" | "secondary";
  command: string;
  projectSlug: string;
  engineId: string;
  formAction: (payload: FormData) => void;
  state: ControlButtonState;
}) {
  return (
    <form action={formAction} className="relative z-0">
      <input type="hidden" name="projectSlug" value={projectSlug} />
      <input type="hidden" name="engineId" value={engineId} />
      <input type="hidden" name="command" value={command} />
      <Button
        type="submit"
        size="sm"
        variant={variant}
        disabled={!state.enabled}
        title={state.reason ?? undefined}
        aria-disabled={!state.enabled}
      >
        {label}
      </Button>
    </form>
  );
}

function isFreshRunOnceLog(createdAt: string, queuedAt: number | null): boolean {
  if (!queuedAt) return false;
  return new Date(createdAt).getTime() >= queuedAt - 1000;
}

async function waitForExportCancellation(projectId: string, operationId: string): Promise<void> {
  const current = await getWebpageExportOperation(projectId);
  if (
    !current ||
    current.operationId !== operationId ||
    !isActiveWebpageExportStatus(current.status)
  ) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      unsubscribe();
      window.clearTimeout(timeoutId);
      resolve();
    };

    const unsubscribe = subscribeToWebpageExportOperations((operations) => {
      const operation = operations.find((entry) => entry.operationId === operationId) ?? null;
      if (!operation || !isActiveWebpageExportStatus(operation.status)) {
        finish();
      }
    });

    const timeoutId = window.setTimeout(() => {
      finish();
    }, 120_000);

    void getWebpageExportOperation(projectId).then((operation) => {
      if (
        !operation ||
        operation.operationId !== operationId ||
        !isActiveWebpageExportStatus(operation.status)
      ) {
        finish();
      }
    });
  });
}

export function EngineControls({
  projectId,
  projectSlug,
  engine,
  actualState,
  desiredState,
  canControl,
  activeCommand,
  canRecoverStaleCommand = false,
  status = null,
  logs = [],
  onRefresh,
  suppressConfigurationErrors = false,
  layout = "default",
  stateStatusDetail,
  operationalError = null,
  realtimeDisconnected = false,
  showNotificationArea = true,
}: EngineControlsProps) {
  const engineId = engine.id;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const useLocalDesktop = mounted && shouldUseLocalDesktopEngine(engine);

  const [state, formAction] = useActionState(
    sendEngineCommand,
    initialDataEngineActionState,
  );
  const [recoveryState, recoveryAction] = useActionState(
    failStaleEngineCommand,
    initialDataEngineActionState,
  );
  const [desktopMessage, setDesktopMessage] = useState<string | null>(null);
  const [desktopError, setDesktopError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingDesktopCommand, setPendingDesktopCommand] = useState(false);
  const [stoppingDesktop, setStoppingDesktop] = useState(false);
  const [runOnceQueuedAt, setRunOnceQueuedAt] = useState<number | null>(null);
  const [runOnceRefreshSent, setRunOnceRefreshSent] = useState(false);
  const [scraperInterruptDialog, setScraperInterruptDialog] =
    useState<ScraperInterruptDialog | null>(null);
  const [interruptBusy, setInterruptBusy] = useState(false);
  const keepRunningButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const runOncePhase = useMemo<RunOncePhase | null>(() => {
    if (!runOnceQueuedAt) return null;
    const stage = getRunOnceStageFromLogs(logs, runOnceQueuedAt);
    if (stage === "failed") return "failed";
    if (stage === "complete") return "complete";
    if (stage === "updating-live-state") return "updating-live-state";
    if (stage === "writing-snapshot") return "writing-snapshot";
    if (stage === "scraping") return "scraping";
    if (stage === "starting") return "starting";
    return "starting";
  }, [logs, runOnceQueuedAt]);

  const runOnceFailedMessage = useMemo(() => {
    if (runOncePhase !== "failed" || !runOnceQueuedAt) return null;
    const failedLog = logs.find(
      (log) =>
        (log.event_type === "scrape.failed" ||
          (log.event_type === "bag.diagnostic" && log.metadata?.failed === true)) &&
        isFreshRunOnceLog(log.created_at, runOnceQueuedAt),
    );
    return failedLog?.message || "Run Once scrape failed.";
  }, [logs, runOncePhase, runOnceQueuedAt]);

  useEffect(() => {
    if (!runOnceQueuedAt || runOnceRefreshSent) return;
    if (runOncePhase !== "complete" && runOncePhase !== "failed") return;

    const timer = window.setTimeout(() => {
      setRunOnceRefreshSent(true);
      onRefresh?.();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [onRefresh, runOncePhase, runOnceQueuedAt, runOnceRefreshSent]);

  useEffect(() => {
    if (
      stoppingDesktop &&
      (actualState === "stopped" || actualState === "offline")
    ) {
      startTransition(() => {
        setStoppingDesktop(false);
      });
    }
  }, [actualState, stoppingDesktop]);

  const desktopStoppingActive =
    stoppingDesktop &&
    actualState !== "stopped" &&
    actualState !== "offline";

  const effectiveActualState: EngineActualState = desktopStoppingActive
    ? "stopping"
    : actualState;

  const controlState = getEngineControlState({
    canControl,
    actualState: effectiveActualState,
    desiredState,
    activeCommand: useLocalDesktop ? null : activeCommand,
  });

  const activeCommandMessage =
    controlState.activeCommand !== null
      ? getActiveCommandMessage(controlState.activeCommand)
      : null;
  const showStaleRecovery =
    canRecoverStaleCommand &&
    controlState.activeCommand !== null &&
    isCommandStale(controlState.activeCommand);

  const runDesktopCommand = useCallback(
    async (command: EngineCommand) => {
      setDesktopError(null);
      setDesktopMessage(null);
      setPendingDesktopCommand(true);

      if (command === "stop") {
        setStoppingDesktop(true);
      }

      if (command === "run_once") {
        setRunOnceQueuedAt(Date.now());
        setRunOnceRefreshSent(false);
        setDesktopError(null);
      }

      try {
        const result = await controlDesktopEngine(engineId, command, userId);
        if (result.ok) {
          if (command === "run_once") {
            setDesktopMessage("Run Once queued. Waiting for scrape completion.");
          } else if (command === "stop") {
            setDesktopMessage("Stop requested. Waiting for worker shutdown.");
          } else {
            setDesktopMessage(result.message);
          }
          onRefresh?.();
        } else {
          setDesktopError(result.message);
          if (command === "stop") {
            setStoppingDesktop(false);
          }
          if (command === "run_once") {
            setRunOnceQueuedAt(null);
          }
        }
      } catch (error) {
        setDesktopError(
          error instanceof Error ? error.message : "Desktop command failed.",
        );
        if (command === "stop") {
          setStoppingDesktop(false);
        }
        if (command === "run_once") {
          setRunOnceQueuedAt(null);
        }
      } finally {
        setPendingDesktopCommand(false);
      }
    },
    [engineId, onRefresh, userId],
  );

  const requestDesktopCommand = useCallback(
    async (command: EngineCommand) => {
      if (!useLocalDesktop || !projectId) {
        await runDesktopCommand(command);
        return;
      }

      if (command !== "stop" && command !== "restart") {
        await runDesktopCommand(command);
        return;
      }

      const operation = await getWebpageExportOperation(projectId);
      if (!operation || !isActiveWebpageExportStatus(operation.status)) {
        await runDesktopCommand(command);
        return;
      }

      setScraperInterruptDialog({
        command,
        operationId: operation.operationId,
      });
    },
    [projectId, runDesktopCommand, useLocalDesktop],
  );

  async function handleKeepScraperRunning() {
    setScraperInterruptDialog(null);
    setInterruptBusy(false);
  }

  async function handleConfirmScraperInterrupt() {
    if (!scraperInterruptDialog || !projectId) return;
    const { command, operationId } = scraperInterruptDialog;
    setInterruptBusy(true);
    try {
      await cancelCurrentWebpageDownload(operationId);
      await waitForExportCancellation(projectId, operationId);
      setScraperInterruptDialog(null);
      await runDesktopCommand(command);
    } catch (error) {
      setDesktopError(
        error instanceof Error ? error.message : "Unable to stop the scraper safely.",
      );
      if (command === "stop") {
        setStoppingDesktop(false);
      }
    } finally {
      setInterruptBusy(false);
    }
  }

  const helperMessages = [
    controlState.start.reason,
    controlState.stop.reason,
    controlState.restart.reason,
    controlState.runOnce.reason,
  ].filter((reason, index, list) => reason && list.indexOf(reason) === index);

  const desktopDisabled =
    pendingDesktopCommand || effectiveActualState === "stopping" || !canControl || interruptBusy;
  const showDesktopError =
    desktopError &&
    !(suppressConfigurationErrors && isBroadArrowConfigurationError(desktopError));
  const showServerError =
    state.error &&
    !(suppressConfigurationErrors && isBroadArrowConfigurationError(state.error));

  const buttonRow = (
    <div className="flex flex-wrap gap-2">
      {useLocalDesktop ? (
        <>
          <DesktopControlButton
            label="Start"
            disabled={desktopDisabled || !controlState.start.enabled}
            reason={controlState.start.reason}
            onClick={() => void requestDesktopCommand("start")}
          />
          <DesktopControlButton
            label="Stop"
            variant="secondary"
            disabled={desktopDisabled || !controlState.stop.enabled}
            reason={controlState.stop.reason}
            onClick={() => void requestDesktopCommand("stop")}
          />
          <DesktopControlButton
            label="Restart"
            variant="secondary"
            disabled={desktopDisabled || !controlState.restart.enabled}
            reason={controlState.restart.reason}
            onClick={() => void requestDesktopCommand("restart")}
          />
          <DesktopControlButton
            label="Run Once"
            variant="secondary"
            disabled={desktopDisabled || !controlState.runOnce.enabled}
            reason={controlState.runOnce.reason}
            onClick={() => void requestDesktopCommand("run_once")}
          />
        </>
      ) : (
        <>
          <ServerControlButton
            label="Start"
            command="start"
            projectSlug={projectSlug}
            engineId={engineId}
            formAction={formAction}
            state={controlState.start}
          />
          <ServerControlButton
            label="Stop"
            variant="secondary"
            command="stop"
            projectSlug={projectSlug}
            engineId={engineId}
            formAction={formAction}
            state={controlState.stop}
          />
          <ServerControlButton
            label="Restart"
            variant="secondary"
            command="restart"
            projectSlug={projectSlug}
            engineId={engineId}
            formAction={formAction}
            state={controlState.restart}
          />
          <ServerControlButton
            label="Run Once"
            variant="secondary"
            command="run_once"
            projectSlug={projectSlug}
            engineId={engineId}
            formAction={formAction}
            state={controlState.runOnce}
          />
        </>
      )}
    </div>
  );

  const statusMessages = (
    <>
      {realtimeDisconnected ? (
        <EngineStateInlineAlert variant="error">
          Live updates disconnected. Use refresh or reload the page.
        </EngineStateInlineAlert>
      ) : null}

      {operationalError ? (
        <EngineStateInlineAlert variant="error">{operationalError}</EngineStateInlineAlert>
      ) : null}

      {runOncePhase ? (
        <p className="text-xs text-muted">
          Run Once: {RUN_ONCE_PHASE_LABELS[runOncePhase]}
          {runOncePhase === "complete" ? " — snapshot, live state, SSE, and preview updated." : ""}
        </p>
      ) : null}

      {runOnceFailedMessage ? (
        <EngineStateInlineAlert variant="error">{runOnceFailedMessage}</EngineStateInlineAlert>
      ) : null}

      {controlState.hasActiveCommand && activeCommandMessage ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">{activeCommandMessage}</p>
          {showStaleRecovery && controlState.activeCommand ? (
            <form action={recoveryAction} className="relative z-0">
              <input type="hidden" name="projectSlug" value={projectSlug} />
              <input type="hidden" name="engineId" value={engineId} />
              <input
                type="hidden"
                name="commandId"
                value={String(controlState.activeCommand.id)}
              />
              <Button type="submit" size="sm" variant="secondary">
                Mark stale command failed
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {!canControl ? (
        <p className="text-xs text-muted">You have read-only access to this Data Engine.</p>
      ) : helperMessages.length > 0 && !controlState.hasActiveCommand ? (
        <div className="space-y-1 text-xs text-muted">
          {helperMessages.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      ) : null}

      {layout === "default" && desiredState === "running" && actualState !== "running" ? (
        <p className="text-xs text-muted">
          Desired state is running, but the engine is not running yet.
        </p>
      ) : null}

      {showDesktopError ? (
        <EngineStateInlineAlert variant="error">{desktopError}</EngineStateInlineAlert>
      ) : null}
      {desktopMessage ? (
        <EngineStateInlineAlert variant="success">{desktopMessage}</EngineStateInlineAlert>
      ) : null}
      {showServerError ? (
        <EngineStateInlineAlert variant="error">{state.error}</EngineStateInlineAlert>
      ) : null}
      {state.success ? (
        <EngineStateInlineAlert variant="success">{state.success}</EngineStateInlineAlert>
      ) : null}
      {recoveryState.error ? (
        <EngineStateInlineAlert variant="error">{recoveryState.error}</EngineStateInlineAlert>
      ) : null}
      {recoveryState.success ? (
        <EngineStateInlineAlert variant="success">{recoveryState.success}</EngineStateInlineAlert>
      ) : null}
    </>
  );

  const hasNotification =
    realtimeDisconnected ||
    Boolean(operationalError) ||
    Boolean(runOncePhase) ||
    Boolean(runOnceFailedMessage) ||
    (controlState.hasActiveCommand && Boolean(activeCommandMessage)) ||
    !canControl ||
    (helperMessages.length > 0 && !controlState.hasActiveCommand) ||
    (layout === "default" && desiredState === "running" && actualState !== "running") ||
    Boolean(showDesktopError) ||
    Boolean(desktopMessage) ||
    Boolean(showServerError) ||
    Boolean(state.success) ||
    Boolean(recoveryState.error) ||
    Boolean(recoveryState.success);

  const interruptDialog = scraperInterruptDialog ? (
    <NeudModal
      title="Stop Webpage Scraper?"
      description={
        scraperInterruptDialog.command === "restart"
          ? "A Current Webpage download is still in progress.\n\nRestarting the Webpage Scraper will cancel the active download and may remove the incomplete download package.\n\nDo you want to restart the scraper?"
          : "A Current Webpage download is still in progress.\n\nStopping the Webpage Scraper will cancel the active download and may remove the incomplete download package.\n\nDo you want to stop the scraper?"
      }
      onClose={() => void handleKeepScraperRunning()}
      closeOnBackdrop={false}
      icon={
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-warning/30 bg-warning/10 text-warning">
          !
        </div>
      }
      initialFocusRef={keepRunningButtonRef}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            ref={keepRunningButtonRef}
            type="button"
            variant="secondary"
            disabled={interruptBusy}
            onClick={() => void handleKeepScraperRunning()}
          >
            Keep Running
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={interruptBusy}
            onClick={() => void handleConfirmScraperInterrupt()}
          >
            {interruptBusy
              ? "Cancelling Download…"
              : scraperInterruptDialog.command === "restart"
                ? "Restart Scraper"
                : "Stop Scraper"}
          </Button>
        </div>
      }
    />
  ) : null;

  if (layout === "inline-state") {
    return (
      <>
        <EngineStatePanel
          actualState={effectiveActualState}
          activeCommand={activeCommand}
          controls={buttonRow}
          statusDetail={stateStatusDetail}
          notification={hasNotification ? statusMessages : null}
          showNotificationArea={showNotificationArea}
        />
        {interruptDialog}
      </>
    );
  }

  return (
    <>
      <div className="relative z-0 space-y-3">
        {buttonRow}
        {statusMessages}
      </div>
      {interruptDialog}
    </>
  );
}
