import { COMMAND_STALE_AFTER_MS } from "@/lib/data-engines/constants";
import type { DataEngineCommand } from "@/lib/data-engines/types";

export function isCommandStale(
  command: DataEngineCommand | null,
  staleAfterMs = COMMAND_STALE_AFTER_MS,
): boolean {
  if (!command || command.status !== "processing") {
    return false;
  }

  if (!command.processing_started_at) {
    return false;
  }

  const ageMs = Date.now() - new Date(command.processing_started_at).getTime();
  return ageMs > staleAfterMs;
}

export function getActiveCommandMessage(
  command: DataEngineCommand,
  staleAfterMs = COMMAND_STALE_AFTER_MS,
): string {
  if (isCommandStale(command, staleAfterMs)) {
    return "This command appears stuck. Restart the worker or mark the command failed.";
  }

  return `Waiting for the current command to finish (${command.command.replace("_", " ")}, ${command.status}).`;
}
