"use client";

import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import type { PinnedStackRecord } from "@/lib/displays/pinned-viewer-stacks";
import { localGetPinnedViewerState } from "@/lib/local/pinned-viewer-api";
import {
  buildOutputInterruptionPrompt,
  getActiveOutputs,
  getActiveOutputsAffectedByDisplay,
  getActiveOutputsForStacks,
  shouldConfirmOutputInterruption,
  uniqueActiveOutputRouteIds,
  type ActiveOutputSession,
  type OutputInterruptionReason,
  type OutputRouteSessionSnapshot,
} from "@/lib/output/output-interruption-guard";

export type OutputInterruptionRequestDetail = {
  requestId: string;
  reason: OutputInterruptionReason;
  activeOutputs: ActiveOutputSession[];
  scraperActive?: boolean;
};

export type OutputInterruptionResponseDetail = {
  requestId: string;
  action: "cancel" | "continue";
};

const OUTPUT_INTERRUPTION_REQUEST = "neud-output-interruption-request";
const OUTPUT_INTERRUPTION_RESPONSE = "neud-output-interruption-response";

function randomRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `output-interruption-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Prompt the user before stopping live outputs. Returns true when the user chose to continue. */
export async function confirmOutputInterruption(
  reason: OutputInterruptionReason,
  input: {
    activeOutputs: ActiveOutputSession[];
    scraperActive?: boolean;
  },
): Promise<boolean> {
  if (!shouldConfirmOutputInterruption(input.activeOutputs)) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }

  const requestId = randomRequestId();
  return new Promise<boolean>((resolve) => {
    const onResponse = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as OutputInterruptionResponseDetail | undefined;
      if (!detail || detail.requestId !== requestId) return;
      window.removeEventListener(OUTPUT_INTERRUPTION_RESPONSE, onResponse);
      resolve(detail.action === "continue");
    };
    window.addEventListener(OUTPUT_INTERRUPTION_RESPONSE, onResponse);
    window.dispatchEvent(
      new CustomEvent<OutputInterruptionRequestDetail>(OUTPUT_INTERRUPTION_REQUEST, {
        detail: {
          requestId,
          reason,
          activeOutputs: input.activeOutputs,
          scraperActive: input.scraperActive,
        },
      }),
    );
  });
}

export function getOutputInterruptionPromptCopy(
  reason: OutputInterruptionReason,
  input: { activeOutputs: ActiveOutputSession[]; scraperActive?: boolean },
) {
  return buildOutputInterruptionPrompt({ reason, ...input });
}

export async function listOutputRouteSnapshots(): Promise<OutputRouteSessionSnapshot[]> {
  const api = getDesktopAPI();
  if (!isDesktopEnvironment() || typeof api?.output?.listRoutes !== "function") {
    return [];
  }
  const routes = (await api.output.listRoutes()) as OutputRouteSessionSnapshot[];
  return Array.isArray(routes) ? routes : [];
}

export async function fetchActiveOutputSessions(): Promise<ActiveOutputSession[]> {
  const routes = await listOutputRouteSnapshots();
  return getActiveOutputs(routes);
}

export async function stopActiveOutputRoutes(routeIds: string[]): Promise<void> {
  const api = getDesktopAPI();
  if (!isDesktopEnvironment() || typeof api?.output?.stop !== "function") {
    return;
  }
  for (const routeId of [...new Set(routeIds.map((id) => id.trim()).filter(Boolean))]) {
    await api.output.stop(routeId);
  }
}

export async function confirmAndStopOutputsForStacks(
  stackIds: string[],
): Promise<boolean> {
  const routes = await listOutputRouteSnapshots();
  const affected = getActiveOutputsForStacks(routes, stackIds);
  if (!shouldConfirmOutputInterruption(affected)) {
    return true;
  }
  const continued = await confirmOutputInterruption("stackChange", { activeOutputs: affected });
  if (!continued) {
    return false;
  }
  await stopActiveOutputRoutes(uniqueActiveOutputRouteIds(affected));
  return true;
}

/** Prompt and stop live outputs that use this display (direct or via stack). */
export async function confirmAndStopOutputsForDisplay(input: {
  displayId: string;
  projectSlug: string;
  projectId?: string;
}): Promise<boolean> {
  const displayId = input.displayId.trim();
  if (!displayId) {
    return true;
  }
  const routes = await listOutputRouteSnapshots();
  let pinnedStacks: PinnedStackRecord[] = [];
  const projectId = input.projectId?.trim() ?? "";
  if (projectId && input.projectSlug.trim()) {
    try {
      const state = await localGetPinnedViewerState(input.projectSlug, projectId);
      pinnedStacks = state.pinnedStacks ?? [];
    } catch {
      pinnedStacks = [];
    }
  }
  const affected = getActiveOutputsAffectedByDisplay(routes, displayId, pinnedStacks);
  if (!shouldConfirmOutputInterruption(affected)) {
    return true;
  }
  const continued = await confirmOutputInterruption("displayChange", {
    activeOutputs: affected,
  });
  if (!continued) {
    return false;
  }
  await stopActiveOutputRoutes(uniqueActiveOutputRouteIds(affected));
  return true;
}
