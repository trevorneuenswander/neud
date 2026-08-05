import type { EngineActualState, EngineDesiredState } from "@/lib/data-engines/constants";
import { formatActualState } from "@/lib/data-engines/format";
import type { DataEngineCommand } from "@/lib/data-engines/types";

const HEARTBEAT_FRESH_MS = 30_000;

export function isHeartbeatFresh(
  lastHeartbeatAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastHeartbeatAt) {
    return false;
  }
  const parsed = Date.parse(lastHeartbeatAt);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  return nowMs - parsed <= HEARTBEAT_FRESH_MS;
}

export function resolveEngineOperationalState(input: {
  actualState: EngineActualState;
  desiredState: EngineDesiredState;
  workerLive?: boolean;
  lastHeartbeatAt?: string | null;
  managedProcessState?: string | null;
}): EngineActualState {
  const {
    actualState,
    desiredState,
    workerLive = false,
    lastHeartbeatAt = null,
    managedProcessState = null,
  } = input;

  if (managedProcessState === "stopping" || actualState === "stopping") {
    return "stopping";
  }

  if (actualState === "error") {
    return "error";
  }

  if (actualState === "authenticating") {
    return "authenticating";
  }

  if (actualState === "running") {
    return "running";
  }

  if (actualState === "starting") {
    return "starting";
  }

  if (actualState === "stopped" && desiredState !== "running") {
    return "stopped";
  }

  const startupInProgress =
    desiredState === "running" &&
    (workerLive ||
      managedProcessState === "starting" ||
      isHeartbeatFresh(lastHeartbeatAt));

  if (!startupInProgress) {
    return actualState;
  }

  if (actualState === "offline") {
    return "starting";
  }

  if (actualState === "stopped") {
    return "starting";
  }

  return actualState;
}

export const OPERATIONAL_STATE_STYLES: Record<string, string> = {
  Running: "border-success/30 bg-success/10 text-success",
  Starting: "border-success/30 bg-success/10 text-success",
  Authenticating: "border-success/30 bg-success/10 text-success",
  "Running Once": "border-success/30 bg-success/10 text-success",
  Restarting: "border-warning/30 bg-warning/10 text-warning",
  Stopping: "border-warning/30 bg-warning/10 text-warning",
  Stopped: "border-border bg-surface-raised text-muted",
  Offline: "border-border bg-surface-raised text-muted",
  Error: "border-danger/30 bg-danger/10 text-danger",
};

export function getOperationalStateLabel(
  actualState: string,
  activeCommand?: DataEngineCommand | null,
): string {
  if (
    activeCommand?.command === "run_once" &&
    actualState !== "stopped" &&
    actualState !== "offline"
  ) {
    return "Running Once";
  }

  if (
    activeCommand?.command === "restart" &&
    (actualState === "starting" ||
      actualState === "authenticating" ||
      actualState === "stopping")
  ) {
    return "Restarting";
  }

  if (actualState === "offline") {
    return "Stopped";
  }

  return formatActualState(actualState as EngineActualState);
}
