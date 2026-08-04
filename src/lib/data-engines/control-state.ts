import type { EngineActualState, EngineDesiredState } from "@/lib/data-engines/constants";
import { getActiveCommandMessage } from "@/lib/data-engines/command-utils";
import type { DataEngineCommand, WebpageScraperSource } from "@/lib/data-engines/types";

export const BROAD_ARROW_CONFIG_INCOMPLETE_MESSAGE =
  "URL configuration is incomplete. Configure the required URLs before starting the scraper.";

export const BROAD_ARROW_UI_SOURCE_KEYS = [
  "login",
  "vehicles",
  "auction-display",
] as const;

export type BroadArrowConfigurationState = {
  complete: boolean;
  message: string | null;
};

function isValidBroadArrowUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getBroadArrowConfigurationState(
  sources: WebpageScraperSource[],
): BroadArrowConfigurationState {
  for (const sourceKey of BROAD_ARROW_UI_SOURCE_KEYS) {
    const source = sources.find((entry) => entry.source_key === sourceKey);
    if (!source || !source.enabled || !isValidBroadArrowUrl(source.url)) {
      return {
        complete: false,
        message: BROAD_ARROW_CONFIG_INCOMPLETE_MESSAGE,
      };
    }
  }

  return { complete: true, message: null };
}

export function isBroadArrowConfigurationError(
  message: string | null | undefined,
): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.trim().toLowerCase();
  if (normalized === BROAD_ARROW_CONFIG_INCOMPLETE_MESSAGE.toLowerCase()) {
    return true;
  }

  if (normalized.includes("page url is not configured")) {
    return true;
  }

  return (
    normalized.includes("is not configured") &&
    (normalized.includes("login url") ||
      normalized.includes("auction table url") ||
      normalized.includes("auction url") ||
      normalized.includes("auction display url") ||
      normalized.includes("vehicle detail"))
  );
}

export type ControlAction = "start" | "stop" | "restart" | "run_once";

export type ControlButtonState = {
  enabled: boolean;
  reason: string | null;
};

export type EngineControlState = {
  activeCommand: DataEngineCommand | null;
  hasActiveCommand: boolean;
  start: ControlButtonState;
  stop: ControlButtonState;
  restart: ControlButtonState;
  runOnce: ControlButtonState;
};

const ACTIVE_COMMAND_STATUSES = new Set(["pending", "processing"]);

export function isActiveCommandStatus(status: string): boolean {
  return ACTIVE_COMMAND_STATUSES.has(status);
}

export function normalizeActiveCommand(
  command: DataEngineCommand | null,
): DataEngineCommand | null {
  if (!command) return null;
  return isActiveCommandStatus(command.status) ? command : null;
}

function formatActiveCommandReason(command: DataEngineCommand): string {
  return getActiveCommandMessage(command);
}

export function getEngineControlState(input: {
  canControl: boolean;
  actualState: EngineActualState;
  desiredState: EngineDesiredState;
  activeCommand: DataEngineCommand | null;
}): EngineControlState {
  const { canControl, actualState, desiredState } = input;
  const activeCommand = normalizeActiveCommand(input.activeCommand);
  const hasActiveCommand = activeCommand !== null;

  function gate(allowed: boolean, reasonWhenDisabled: string): ControlButtonState {
    if (!canControl) {
      return { enabled: false, reason: "Viewer access is read-only." };
    }
    if (hasActiveCommand && activeCommand) {
      return { enabled: false, reason: formatActiveCommandReason(activeCommand) };
    }
    if (!allowed) {
      return { enabled: false, reason: reasonWhenDisabled };
    }
    return { enabled: true, reason: null };
  }

  const canStart =
    actualState === "offline" ||
    actualState === "stopped" ||
    actualState === "error";

  const startReason =
    actualState === "starting"
      ? "Worker is starting."
      : actualState === "running"
        ? "Engine is already running."
        : actualState === "stopping"
          ? "Engine is stopping."
          : "Start is unavailable in the current state.";

  const canStop =
    actualState !== "stopping" &&
    (desiredState === "running" ||
      actualState === "starting" ||
      actualState === "running");

  const stopReason =
    actualState === "stopping"
      ? "Engine is stopping."
      : "Stop is unavailable while the engine is idle.";

  const canRestart =
    actualState === "running" ||
    actualState === "error" ||
    actualState === "stopped";

  const restartReason =
    actualState === "offline"
      ? "Worker is not connected."
      : actualState === "starting"
        ? "Worker is starting."
        : actualState === "stopping"
          ? "Engine is stopping."
          : "Restart is unavailable in the current state.";

  const canRunOnce =
    actualState === "offline" ||
    actualState === "stopped" ||
    actualState === "running" ||
    actualState === "error";

  const runOnceReason =
    actualState === "starting"
      ? "Worker is starting."
      : actualState === "stopping"
        ? "Engine is stopping."
        : "Run Once is unavailable in the current state.";

  return {
    activeCommand,
    hasActiveCommand,
    start: gate(canStart, startReason),
    stop: gate(canStop, stopReason),
    restart: gate(canRestart, restartReason),
    runOnce: gate(canRunOnce, runOnceReason),
  };
}
