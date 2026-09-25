"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  localAddPinnedDisplayToStack,
  localGetPinnedViewerState,
  localRemovePinnedDisplayFromStack,
  localSetPinnedViewerHeight,
  localTogglePinnedDisplay,
  localUnpinPinnedViewerStack,
  type PinnedViewerDisplaySummary,
  type PinnedViewerState,
} from "@/lib/local/pinned-viewer-api";
import {
  MAX_PINNED_DISPLAYS_MESSAGE,
  type VisiblePinnedSlot,
} from "@/lib/displays/pinned-viewer-stacks";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import {
  clampPinnedViewerHeight,
  DEFAULT_PINNED_VIEWER_HEIGHT_PX,
  normalizePinnedViewerHeight,
} from "@/lib/displays/pinned-viewer-preference";
import {
  logPinActionDiagnostics,
  mergeOptimisticPinnedDisplays,
  type PinFailureStage,
} from "@/lib/displays/pinned-viewer-pin-diagnostics";

type PinnedViewerContextValue = {
  projectId: string;
  projectSlug: string;
  state: PinnedViewerState | null;
  viewerHeightPx: number;
  pinnedDisplayIds: string[];
  pinnedDisplays: PinnedViewerDisplaySummary[];
  visibleSlots: VisiblePinnedSlot[];
  pinMessage: string | null;
  isPinned: (displayId: string) => boolean;
  togglePin: (
    displayId: string,
    displaySummary?: PinnedViewerDisplaySummary,
  ) => Promise<void>;
  unpinDisplay: (displayId: string) => Promise<void>;
  addDisplayToStack: (
    sourceDisplayId: string,
    target:
      | { kind: "display"; displayId: string }
      | { kind: "stack"; stackId: string },
  ) => Promise<void>;
  removeDisplayFromStack: (stackId: string, displayId: string) => Promise<void>;
  unpinStack: (stackId: string) => Promise<void>;
  setViewerHeightPx: (height: number, options?: { persist?: boolean }) => void;
  refresh: () => Promise<void>;
};

const PinnedViewerContext = createContext<PinnedViewerContextValue | null>(null);

export function PinnedViewerProvider({
  projectId,
  projectSlug,
  children,
}: {
  projectId: string;
  projectSlug: string;
  children: ReactNode;
}) {
  const enabled = shouldUseLocalDataClient();
  const [state, setState] = useState<PinnedViewerState | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [draftHeightPx, setDraftHeightPx] = useState(DEFAULT_PINNED_VIEWER_HEIGHT_PX);
  const pinMessageTimerRef = useRef<number | null>(null);
  const refreshReceivedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    refreshReceivedRef.current = true;
    const next = await localGetPinnedViewerState(projectSlug, projectId);
    setState(next);
    setDraftHeightPx(
      normalizePinnedViewerHeight(
        next.viewerHeightPx,
        typeof window !== "undefined" ? window.innerHeight : undefined,
      ),
    );
  }, [enabled, projectId, projectSlug]);

  useEffect(() => {
    if (!enabled) return;
    void refresh().catch(() => {
      // offline/local errors keep last state
    });
  }, [enabled, projectId, projectSlug, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onRefresh = () => {
      void refresh();
    };
    window.addEventListener("neud:pinned-viewer:refresh", onRefresh);
    return () => window.removeEventListener("neud:pinned-viewer:refresh", onRefresh);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onUnpin = (event: Event) => {
      const detail = (event as CustomEvent<{ displayId?: string }>).detail;
      const displayId = typeof detail?.displayId === "string" ? detail.displayId.trim() : "";
      if (!displayId) return;
      setState((current) => {
        if (!current?.pinnedDisplayIds.includes(displayId)) {
          return current;
        }
        return {
          ...current,
          pinnedDisplayIds: current.pinnedDisplayIds.filter((id) => id !== displayId),
          displays: current.displays.filter((display) => display.id !== displayId),
        };
      });
    };
    window.addEventListener("neud:pinned-viewer:unpin", onUnpin);
    return () => window.removeEventListener("neud:pinned-viewer:unpin", onUnpin);
  }, [enabled]);

  const showPinMessage = useCallback((message: string) => {
    setPinMessage(message);
    if (pinMessageTimerRef.current != null) {
      window.clearTimeout(pinMessageTimerRef.current);
    }
    pinMessageTimerRef.current = window.setTimeout(() => {
      setPinMessage(null);
      pinMessageTimerRef.current = null;
    }, 3500);
  }, []);

  const togglePin = useCallback(
    async (displayId: string, displaySummary?: PinnedViewerDisplaySummary) => {
      if (!enabled) {
        logPinActionDiagnostics({
          projectId,
          userIdPresent: false,
          displayId,
          displayEnabled: true,
          displayArchived: false,
          wasPinned: false,
          toggleRequested: false,
          toggleSucceeded: false,
          localPreferenceAfterToggle: [],
          effectivePinnedDisplayIds: [],
          providerRefreshRequested: false,
          providerRefreshReceived: refreshReceivedRef.current,
          viewerAreaRendered: false,
          firstPinFailureStage: "toggle_disabled",
        });
        return;
      }

      const previous = state;
      const wasPinned = previous?.pinnedDisplayIds.includes(displayId) ?? false;
      const visibleSlotCount = previous?.visibleSlots?.length ?? previous?.pinnedDisplayIds.length ?? 0;
      if (!wasPinned && visibleSlotCount >= 4) {
        showPinMessage(MAX_PINNED_DISPLAYS_MESSAGE);
        logPinActionDiagnostics({
          projectId,
          userIdPresent: true,
          displayId,
          displayEnabled: true,
          displayArchived: false,
          wasPinned,
          toggleRequested: false,
          toggleSucceeded: false,
          localPreferenceAfterToggle: previous?.pinnedDisplayIds ?? [],
          effectivePinnedDisplayIds: previous?.pinnedDisplayIds ?? [],
          providerRefreshRequested: false,
          providerRefreshReceived: refreshReceivedRef.current,
          viewerAreaRendered: (previous?.displays.length ?? 0) > 0,
          firstPinFailureStage: "max_pins_reached",
        });
        return;
      }

      const optimisticIds = wasPinned
        ? (previous?.pinnedDisplayIds.filter((id) => id !== displayId) ?? [])
        : [...(previous?.pinnedDisplayIds ?? []), displayId];

      const optimisticDisplays = mergeOptimisticPinnedDisplays(
        previous?.displays ?? [],
        optimisticIds,
        wasPinned ? null : displaySummary ?? null,
      );

      setState((current) => {
        const base: PinnedViewerState = current ?? {
          pinnedDisplayIds: [],
          pinnedStacks: [],
          viewerHeightPx: draftHeightPx,
          updatedAt: new Date().toISOString(),
          cloudSyncStatus: "pending",
          displays: [],
          visibleSlots: [],
          displayOrderIds: [],
          eligible: [],
        };
        return {
          ...base,
          pinnedDisplayIds: optimisticIds,
          displays: optimisticDisplays,
        };
      });

      let failureStage: PinFailureStage = "none";
      let toggleSucceeded = false;
      let nextState: PinnedViewerState | null = null;

      try {
        nextState = await localTogglePinnedDisplay(projectSlug, projectId, displayId);
        toggleSucceeded = true;
        setState(nextState);
        setDraftHeightPx(
          normalizePinnedViewerHeight(
            nextState.viewerHeightPx,
            typeof window !== "undefined" ? window.innerHeight : undefined,
          ),
        );

        if (
          !wasPinned &&
          nextState.pinnedDisplayIds.includes(displayId) &&
          nextState.displays.length === 0
        ) {
          failureStage = "viewer_displays_empty";
        } else if (
          !wasPinned &&
          !nextState.pinnedDisplayIds.includes(displayId)
        ) {
          failureStage = "sanitized_out";
        } else if (
          wasPinned === nextState.pinnedDisplayIds.includes(displayId) &&
          JSON.stringify(nextState.pinnedDisplayIds) ===
            JSON.stringify(previous?.pinnedDisplayIds ?? [])
        ) {
          failureStage = "preference_unchanged";
        }
      } catch (error) {
        setState(previous ?? null);
        failureStage = "toggle_request_failed";
        const message = error instanceof Error ? error.message : "Could not update pin.";
        if (message.includes("Maximum")) {
          showPinMessage(MAX_PINNED_DISPLAYS_MESSAGE);
        } else {
          showPinMessage(message);
        }
      }

      logPinActionDiagnostics({
        projectId,
        userIdPresent: true,
        displayId,
        displayEnabled: displaySummary?.id === displayId ? true : true,
        displayArchived: false,
        wasPinned,
        toggleRequested: true,
        toggleSucceeded,
        localPreferenceAfterToggle: nextState?.pinnedDisplayIds ?? previous?.pinnedDisplayIds ?? [],
        effectivePinnedDisplayIds: nextState?.pinnedDisplayIds ?? optimisticIds,
        providerRefreshRequested: false,
        providerRefreshReceived: refreshReceivedRef.current,
        viewerAreaRendered: (nextState?.displays.length ?? optimisticDisplays.length) > 0,
        firstPinFailureStage: failureStage,
      });
    },
    [draftHeightPx, enabled, projectId, projectSlug, showPinMessage, state],
  );

  const applyPinnedMutation = useCallback(
    async (mutation: () => Promise<PinnedViewerState>) => {
      if (!enabled) return;
      const previous = state;
      try {
        const next = await mutation();
        setState(next);
        setDraftHeightPx(
          normalizePinnedViewerHeight(
            next.viewerHeightPx,
            typeof window !== "undefined" ? window.innerHeight : undefined,
          ),
        );
      } catch (error) {
        setState(previous ?? null);
        const message = error instanceof Error ? error.message : "Could not update pinned viewer.";
        showPinMessage(message);
      }
    },
    [enabled, showPinMessage, state],
  );

  const unpinDisplay = useCallback(
    async (displayId: string) => {
      const trimmed = displayId.trim();
      if (!trimmed) return;
      if (state?.pinnedDisplayIds.includes(trimmed)) {
        await togglePin(trimmed);
      }
    },
    [state?.pinnedDisplayIds, togglePin],
  );

  const addDisplayToStack = useCallback(
    async (
      sourceDisplayId: string,
      target:
        | { kind: "display"; displayId: string }
        | { kind: "stack"; stackId: string },
    ) => {
      await applyPinnedMutation(() =>
        localAddPinnedDisplayToStack(projectSlug, projectId, {
          sourceDisplayId,
          target,
        }),
      );
    },
    [applyPinnedMutation, projectId, projectSlug],
  );

  const removeDisplayFromStack = useCallback(
    async (stackId: string, displayId: string) => {
      await applyPinnedMutation(() =>
        localRemovePinnedDisplayFromStack(projectSlug, projectId, { stackId, displayId }),
      );
    },
    [applyPinnedMutation, projectId, projectSlug],
  );

  const unpinStack = useCallback(
    async (stackId: string) => {
      await applyPinnedMutation(() =>
        localUnpinPinnedViewerStack(projectSlug, projectId, stackId),
      );
    },
    [applyPinnedMutation, projectId, projectSlug],
  );

  const setViewerHeightPx = useCallback(
    (height: number, options?: { persist?: boolean }) => {
      const clamped = normalizePinnedViewerHeight(
        height,
        typeof window !== "undefined" ? window.innerHeight : undefined,
      );
      setDraftHeightPx(clamped);
      if (!options?.persist) {
        return;
      }
      if (!enabled) return;
      void localSetPinnedViewerHeight(projectSlug, projectId, clamped)
        .then((next) => {
          setState(next);
          setDraftHeightPx(next.viewerHeightPx);
        })
        .catch(() => {
          // keep local draft height
        });
    },
    [enabled, projectId, projectSlug],
  );

  const pinnedDisplayIds = state?.pinnedDisplayIds ?? [];
  const visibleSlots = state?.visibleSlots ?? [];
  const pinnedDisplays = useMemo(
    () => mergeOptimisticPinnedDisplays(state?.displays ?? [], pinnedDisplayIds),
    [pinnedDisplayIds, state?.displays],
  );
  const viewerHeightPx = normalizePinnedViewerHeight(
    draftHeightPx,
    typeof window !== "undefined" ? window.innerHeight : undefined,
  );

  const value = useMemo<PinnedViewerContextValue>(
    () => ({
      projectId,
      projectSlug,
      state,
      viewerHeightPx,
      pinnedDisplayIds,
      pinnedDisplays,
      visibleSlots,
      pinMessage,
      isPinned: (displayId: string) => pinnedDisplayIds.includes(displayId),
      togglePin,
      unpinDisplay,
      addDisplayToStack,
      removeDisplayFromStack,
      unpinStack,
      setViewerHeightPx,
      refresh,
    }),
    [
      addDisplayToStack,
      pinMessage,
      pinnedDisplayIds,
      pinnedDisplays,
      removeDisplayFromStack,
      unpinDisplay,
      unpinStack,
      visibleSlots,
      viewerHeightPx,
      projectId,
      projectSlug,
      refresh,
      setViewerHeightPx,
      state,
      togglePin,
    ],
  );

  if (!enabled) {
    return children;
  }

  return (
    <PinnedViewerContext.Provider value={value}>{children}</PinnedViewerContext.Provider>
  );
}

export function usePinnedViewer() {
  return useContext(PinnedViewerContext);
}

export function requestPinnedViewerRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("neud:pinned-viewer:refresh"));
}

export function requestPinnedViewerUnpin(displayId: string) {
  if (typeof window === "undefined") return;
  const trimmed = displayId.trim();
  if (!trimmed) return;
  window.dispatchEvent(
    new CustomEvent("neud:pinned-viewer:unpin", { detail: { displayId: trimmed } }),
  );
}
