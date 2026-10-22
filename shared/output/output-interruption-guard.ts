import type { PinnedStackRecord } from "../displays/pinned-viewer-stacks";

export type OutputInterruptionReason =
  | "stackChange"
  | "displayChange"
  | "logout"
  | "quit";

export type OutputSourceType = "display" | "stack";

export type ActiveOutputSession = {
  routeId: string;
  name: string;
  projectId: string;
  sourceType: OutputSourceType;
  sourceId: string;
  status: "live" | "starting" | "recording" | "finalizing";
  adapterType?: string;
};

export type OutputRouteSessionSnapshot = {
  id: string;
  name: string;
  projectId: string;
  sourceType: OutputSourceType;
  sourceId: string;
  adapterType?: string;
  session: { status: string };
};

export function isActiveOutputSessionStatus(
  status: string,
): status is ActiveOutputSession["status"] {
  return (
    status === "live" ||
    status === "starting" ||
    status === "recording" ||
    status === "finalizing"
  );
}

function sessionMentionsRecording(session: ActiveOutputSession): boolean {
  return (
    session.adapterType === "disk" ||
    session.status === "recording" ||
    session.status === "finalizing"
  );
}

/** Live, starting, recording, or finalizing outputs from canonical Output Engine route views. */
export function getActiveOutputs(
  routes: OutputRouteSessionSnapshot[],
): ActiveOutputSession[] {
  const active: ActiveOutputSession[] = [];
  for (const route of routes) {
    if (!isActiveOutputSessionStatus(route.session.status)) continue;
    active.push({
      routeId: route.id,
      name: route.name,
      projectId: route.projectId,
      sourceType: route.sourceType === "stack" ? "stack" : "display",
      sourceId: route.sourceId,
      status: route.session.status,
      adapterType: typeof route.adapterType === "string" ? route.adapterType : undefined,
    });
  }
  return active;
}

export function getActiveOutputsForStack(
  routes: OutputRouteSessionSnapshot[],
  stackId: string,
): ActiveOutputSession[] {
  const trimmed = stackId.trim();
  if (!trimmed) return [];
  return getActiveOutputs(routes).filter(
    (entry) => entry.sourceType === "stack" && entry.sourceId === trimmed,
  );
}

export function getActiveOutputsForStacks(
  routes: OutputRouteSessionSnapshot[],
  stackIds: Iterable<string>,
): ActiveOutputSession[] {
  const idSet = new Set([...stackIds].map((id) => id.trim()).filter(Boolean));
  if (idSet.size === 0) return [];
  return getActiveOutputs(routes).filter(
    (entry) => entry.sourceType === "stack" && idSet.has(entry.sourceId),
  );
}

/** Active outputs whose direct source is this display. */
export function getActiveOutputsForDisplay(
  routes: OutputRouteSessionSnapshot[],
  displayId: string,
): ActiveOutputSession[] {
  const trimmed = displayId.trim();
  if (!trimmed) return [];
  return getActiveOutputs(routes).filter(
    (entry) => entry.sourceType === "display" && entry.sourceId === trimmed,
  );
}

/**
 * Active outputs that would be disrupted if this display is deleted, archived,
 * or disabled — direct display sources plus stacks that include the display.
 */
export function getActiveOutputsAffectedByDisplay(
  routes: OutputRouteSessionSnapshot[],
  displayId: string,
  pinnedStacks: PinnedStackRecord[],
): ActiveOutputSession[] {
  const trimmed = displayId.trim();
  if (!trimmed) return [];
  const direct = getActiveOutputsForDisplay(routes, trimmed);
  const stackIds = pinnedStacks
    .filter((stack) => stack.displayIds.includes(trimmed))
    .map((stack) => stack.id);
  const fromStacks = getActiveOutputsForStacks(routes, stackIds);
  const byRouteId = new Map<string, ActiveOutputSession>();
  for (const entry of [...direct, ...fromStacks]) {
    byRouteId.set(entry.routeId, entry);
  }
  return [...byRouteId.values()];
}

export function uniqueActiveOutputRouteIds(sessions: ActiveOutputSession[]): string[] {
  return [...new Set(sessions.map((entry) => entry.routeId))];
}

export type PinnedStackMutationAction =
  | "addToStack"
  | "removeFromStack"
  | "reorderStack"
  | "unpinStack";

/** Stack ids whose composition may change for a pinned-viewer mutation. */
export function stackIdsForPinnedViewerMutation(
  action: PinnedStackMutationAction,
  params: {
    stackId?: string;
    target?:
      | { kind: "display"; displayId: string }
      | { kind: "stack"; stackId: string };
  },
  pinnedStacks: PinnedStackRecord[],
): string[] {
  if (action === "unpinStack" || action === "reorderStack" || action === "removeFromStack") {
    const stackId = params.stackId?.trim() ?? "";
    return stackId ? [stackId] : [];
  }
  if (action !== "addToStack" || !params.target) return [];
  if (params.target.kind === "stack") {
    const stackId = params.target.stackId.trim();
    return stackId ? [stackId] : [];
  }
  const targetDisplayId = params.target.displayId.trim();
  if (!targetDisplayId) return [];
  const existing = pinnedStacks.find((stack) => stack.displayIds.includes(targetDisplayId));
  return existing ? [existing.id] : [];
}

export type OutputInterruptionPromptCopy = {
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  busyConfirmLabel: string;
};

function formatActiveOutputNames(activeOutputs: ActiveOutputSession[]): string {
  const names = [
    ...new Set(activeOutputs.map((entry) => entry.name.trim()).filter(Boolean)),
  ];
  if (names.length === 0) return "an active output";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function buildOutputInterruptionPrompt(input: {
  reason: OutputInterruptionReason;
  activeOutputs: ActiveOutputSession[];
  scraperActive?: boolean;
}): OutputInterruptionPromptCopy {
  const outputCount = uniqueActiveOutputRouteIds(input.activeOutputs).length;
  const multipleOutputs = outputCount > 1;
  const scraperActive = input.scraperActive === true;
  const hasRecording = input.activeOutputs.some(sessionMentionsRecording);
  const nameList = formatActiveOutputNames(input.activeOutputs);

  if (input.reason === "stackChange") {
    let description = `${nameList} ${multipleOutputs ? "are" : "is"} currently on air. Changing this stack may disconnect active outputs.`;
    if (hasRecording) {
      description += " Recording may be interrupted.";
    }
    return {
      title: "Display Is Currently On Air",
      description,
      cancelLabel: "Cancel",
      confirmLabel: "Disconnect Anyway",
      busyConfirmLabel: "Disconnecting…",
    };
  }

  if (input.reason === "displayChange") {
    let description = `${nameList} ${multipleOutputs ? "are" : "is"} currently on air. Deleting, archiving, or disabling this display may disconnect active outputs.`;
    if (hasRecording) {
      description += " Recording may be interrupted.";
    }
    return {
      title: "Display Is Currently On Air",
      description,
      cancelLabel: "Cancel",
      confirmLabel: "Disconnect Anyway",
      busyConfirmLabel: "Disconnecting…",
    };
  }

  if (input.reason === "logout") {
    let description = hasRecording
      ? "Outputs are currently live or recording. Signing out will stop all active outputs and recordings."
      : "Outputs are currently live. Signing out will stop all active outputs.";
    if (scraperActive) {
      description = hasRecording
        ? "Outputs are currently live or recording and the Webpage Scraper is running. Signing out will stop all active outputs, recordings, and data engines."
        : "Outputs are currently live and the Webpage Scraper is running. Signing out will stop all active outputs and data engines.";
    } else if (multipleOutputs && !hasRecording) {
      description =
        "Multiple outputs are currently live. Signing out will stop all active outputs.";
    }
    return {
      title: "Sign out?",
      description,
      cancelLabel: "Cancel",
      confirmLabel: "Sign Out and Stop Outputs",
      busyConfirmLabel: "Stopping Outputs…",
    };
  }

  let description = hasRecording
    ? "Outputs are currently live or recording. Quitting NEUD will stop all active outputs and recordings."
    : "Outputs are currently live. Quitting NEUD will stop all active outputs.";
  if (scraperActive) {
    description = hasRecording
      ? "Outputs are currently live or recording and the Webpage Scraper is running. Quitting NEUD will stop all active outputs, recordings, and the scraper session."
      : "Outputs are currently live and the Webpage Scraper is running. Quitting NEUD will stop all active outputs and the scraper session.";
  } else if (multipleOutputs && !hasRecording) {
    description =
      "Multiple outputs are currently live. Quitting NEUD will stop all active outputs.";
  }
  return {
    title: "Quit NEUD?",
    description,
    cancelLabel: "Cancel",
    confirmLabel: "Quit and Stop Outputs",
    busyConfirmLabel: "Stopping Outputs…",
  };
}

export function shouldConfirmOutputInterruption(activeOutputs: ActiveOutputSession[]): boolean {
  return activeOutputs.length > 0;
}

export class OutputInterruptionCanceledError extends Error {
  constructor() {
    super("Output interruption canceled.");
    this.name = "OutputInterruptionCanceledError";
  }
}
