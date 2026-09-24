import type { PinnedViewerDisplaySummary } from "@/lib/local/pinned-viewer-api";

export type PinFailureStage =
  | "click_handler_missing_context"
  | "toggle_disabled"
  | "max_pins_reached"
  | "toggle_request_failed"
  | "preference_unchanged"
  | "sanitized_out"
  | "viewer_displays_empty"
  | "none";

export type PinActionDiagnostics = {
  projectId: string;
  userIdPresent: boolean;
  displayId: string;
  displayEnabled: boolean;
  displayArchived: boolean;
  wasPinned: boolean;
  toggleRequested: boolean;
  toggleSucceeded: boolean;
  localPreferenceAfterToggle: string[];
  effectivePinnedDisplayIds: string[];
  providerRefreshRequested: boolean;
  providerRefreshReceived: boolean;
  viewerAreaRendered: boolean;
  firstPinFailureStage: PinFailureStage;
};

export function isPinnedViewerPinDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (window.localStorage.getItem("neud:pinned-viewer-pin-debug") === "1") {
    return true;
  }
  try {
    return new URLSearchParams(window.location.search).get("pinnedViewerPinDebug") === "1";
  } catch {
    return false;
  }
}

export function logPinActionDiagnostics(diagnostics: PinActionDiagnostics): void {
  if (!isPinnedViewerPinDebugEnabled()) {
    return;
  }
  console.info("[neud pinned viewer pin]", diagnostics);
}

export function resolvePinnedDisplaysForViewer(input: {
  pinnedDisplayIds: string[];
  displays: PinnedViewerDisplaySummary[];
}): PinnedViewerDisplaySummary[] {
  const byId = new Map(input.displays.map((display) => [display.id, display]));
  return input.pinnedDisplayIds
    .map((id) => byId.get(id))
    .filter((display): display is PinnedViewerDisplaySummary => Boolean(display));
}

export function mergeOptimisticPinnedDisplays(
  previous: PinnedViewerDisplaySummary[],
  pinnedDisplayIds: string[],
  added?: PinnedViewerDisplaySummary | null,
): PinnedViewerDisplaySummary[] {
  const byId = new Map(previous.map((display) => [display.id, display]));
  if (added) {
    byId.set(added.id, added);
  }
  return pinnedDisplayIds
    .map((id) => byId.get(id))
    .filter((display): display is PinnedViewerDisplaySummary => Boolean(display));
}
