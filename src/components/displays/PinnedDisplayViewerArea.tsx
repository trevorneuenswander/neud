"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PinnedDisplayLiveSlot } from "@/components/displays/PinnedDisplayLiveSlot";
import { PinnedDisplayStackSlot } from "@/components/displays/PinnedDisplayStackSlot";
import { PinnedViewerContextMenu } from "@/components/displays/PinnedViewerContextMenu";
import { ReorderPinnedStackModal } from "@/components/displays/ReorderPinnedStackModal";
import { Alert } from "@/components/ui/Alert";
import { recordDesktopActivity } from "@/lib/desktop/activity-session-client";
import { resolvePinnedDisplayLocalUrl } from "@/lib/displays/resolve-pinned-viewer-url";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { usePinnedViewer } from "@/lib/displays/pinned-viewer-context";
import {
  buildSinglePinnedDisplayMenuItems,
  buildStackPinnedDisplayMenuItems,
} from "@/lib/displays/pinned-viewer-context-menu-items";
import {
  evaluatePinnedBandFailureStage,
  logPinnedBandLayoutSnapshot,
} from "@/lib/displays/pinned-viewer-band-diagnostics";
import { normalizePinnedViewerHeight } from "@/lib/displays/pinned-viewer-preference";
import {
  computePinnedContentFitHeight,
  resolvePinnedEffectiveHeightPx,
  resolvePinnedMaxHeightPx,
} from "@/lib/displays/pinned-viewer-content-height";
import type { PinnedViewerMenuItem } from "@/components/displays/PinnedViewerContextMenu";

const COLUMN_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

const RESIZE_HANDLE_HEIGHT_PX = 12;

/** Deterministic pre-mount content width — matches prior SSR/default path. */
const SSR_CONTENT_WIDTH_PX = 800;

type MenuState = {
  x: number;
  y: number;
  items: PinnedViewerMenuItem[];
};

function measurePinnedLayoutAnchor(contentNode: HTMLElement | null): {
  anchorHeightPx: number | null;
  viewportHeightPx: number | null;
} {
  if (typeof window === "undefined" || !contentNode) {
    return { anchorHeightPx: null, viewportHeightPx: null };
  }
  const projectRoot = contentNode.closest(".project-layout-root");
  const shellMain = contentNode.closest(".main-content");
  const anchor = projectRoot ?? shellMain;
  const anchorHeightPx = anchor
    ? Math.floor(anchor.getBoundingClientRect().height)
    : Math.floor(window.innerHeight);
  return {
    anchorHeightPx: anchorHeightPx > 0 ? anchorHeightPx : null,
    viewportHeightPx: Math.floor(window.innerHeight),
  };
}

export function PinnedDisplayViewerArea() {
  const pinnedViewer = usePinnedViewer();
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [dragHeightPx, setDragHeightPx] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [reorderStackId, setReorderStackId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outerBandRef = useRef<HTMLDivElement>(null);
  // SSR + first client render: identical deterministic defaults (no window/document).
  const [contentWidthPx, setContentWidthPx] = useState(0);
  const [anchorHeightPx, setAnchorHeightPx] = useState<number | null>(null);
  const [viewportHeightPx, setViewportHeightPx] = useState<number | null>(null);

  const visibleSlots = pinnedViewer?.visibleSlots ?? [];
  const pinnedDisplays = pinnedViewer?.pinnedDisplays ?? [];
  const count = visibleSlots.length;

  const displaysById = useMemo(
    () => new Map(pinnedDisplays.map((display) => [display.id, display])),
    [pinnedDisplays],
  );

  const aspectDisplay = useMemo(() => {
    let widestRatio = 0;
    let selected: { width: number; height: number } | null = null;
    for (const slot of visibleSlots) {
      const displayIds =
        slot.kind === "stack" ? slot.orderedMemberDisplayIds : [slot.displayId];
      for (const displayId of displayIds) {
        const display = displaysById.get(displayId);
        if (!display || display.width <= 0 || display.height <= 0) continue;
        const ratio = display.height / display.width;
        if (ratio >= widestRatio) {
          widestRatio = ratio;
          selected = { width: display.width, height: display.height };
        }
      }
    }
    return selected ?? { width: 16, height: 9 };
  }, [displaysById, visibleSlots]);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node || count === 0) {
      return;
    }

    const updateMeasurements = () => {
      setContentWidthPx(node.clientWidth);
      const measured = measurePinnedLayoutAnchor(node);
      setAnchorHeightPx(measured.anchorHeightPx);
      setViewportHeightPx(measured.viewportHeightPx);
    };

    updateMeasurements();

    const observer = new ResizeObserver(() => updateMeasurements());
    observer.observe(node);
    const projectRoot = node.closest(".project-layout-root");
    const shellMain = node.closest(".main-content");
    const anchor = projectRoot ?? shellMain;
    if (anchor instanceof Element) {
      observer.observe(anchor);
    }
    window.addEventListener("resize", updateMeasurements);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateMeasurements);
    };
  }, [count]);

  const contentFitHeightPx = useMemo(() => {
    return computePinnedContentFitHeight({
      contentWidthPx: contentWidthPx > 0 ? contentWidthPx : SSR_CONTENT_WIDTH_PX,
      pinCount: Math.max(1, count),
      displayWidth: aspectDisplay.width,
      displayHeight: aspectDisplay.height,
      // contentRef clientWidth is already inside horizontal padding.
      horizontalPaddingPx: 0,
    });
  }, [aspectDisplay.height, aspectDisplay.width, contentWidthPx, count]);

  // Content-fit height is the MAXIMUM for the current pin count — not a fixed height.
  // Operator may shrink below it; persisted preference is preserved when under the max.
  // Schema default 220 means "unset" → follow content-fit max until the operator resizes.
  const maxPinnedHeightPx = resolvePinnedMaxHeightPx({
    contentFitHeightPx,
    anchorHeightPx,
  });
  const effectiveViewerHeightPx = resolvePinnedEffectiveHeightPx({
    storedHeightPx: pinnedViewer?.viewerHeightPx,
    maxPinnedHeightPx,
    dragHeightPx,
    viewportHeightPx,
  });

  const closeMenu = useCallback(() => setMenu(null), []);

  const copyLocalUrl = useCallback(
    async (displayId: string) => {
      if (!pinnedViewer) return;
      const display = displaysById.get(displayId);
      if (!display) return;
      const localUrl = resolvePinnedDisplayLocalUrl({
        projectId: pinnedViewer.projectId,
        displayKey: display.displayKey,
        url: display.url,
        slug: display.slug,
      });
      try {
        await navigator.clipboard.writeText(localUrl);
        pinnedViewer.showNotice("Local URL copied");
        if (shouldUseLocalDataClient()) {
          void recordDesktopActivity({
            type: "display.url-copied",
            message: `Copied ${display.name} local URL`,
            userAction: `copied ${display.name} local URL`,
            source: "displays",
            metadata: {
              displayId: display.id,
              displayKey: display.displayKey,
              displayName: display.name,
              projectId: pinnedViewer.projectId,
              projectSlug: pinnedViewer.projectSlug,
            },
          });
        }
      } catch {
        pinnedViewer.showNotice("Unable to copy Local URL.");
      }
    },
    [displaysById, pinnedViewer],
  );

  const openSingleDisplayMenu = useCallback(
    (event: React.MouseEvent, displayId: string) => {
      event.preventDefault();
      if (!pinnedViewer) return;
      const items = buildSinglePinnedDisplayMenuItems({
        displayId,
        visibleSlots: pinnedViewer.visibleSlots,
        displaysById,
        onUnpin: () => {
          void pinnedViewer.unpinDisplay(displayId);
        },
        onCopyLocalUrl: () => {
          void copyLocalUrl(displayId);
        },
        onAddToStack: (target) => {
          void pinnedViewer.addDisplayToStack(displayId, target);
        },
      });
      setMenu({ x: event.clientX, y: event.clientY, items });
    },
    [copyLocalUrl, displaysById, pinnedViewer],
  );

  const openStackMenu = useCallback(
    (event: React.MouseEvent, slot: Extract<(typeof visibleSlots)[number], { kind: "stack" }>) => {
      event.preventDefault();
      if (!pinnedViewer) return;
      const items = buildStackPinnedDisplayMenuItems({
        slot,
        displaysById,
        onUnpinStack: () => {
          void pinnedViewer.unpinStack(slot.stackId);
        },
        onReorderStack: () => {
          setReorderStackId(slot.stackId);
        },
        onRemoveFromStack: (memberDisplayId) => {
          void pinnedViewer.removeDisplayFromStack(slot.stackId, memberDisplayId);
        },
      });
      setMenu({ x: event.clientX, y: event.clientY, items });
    },
    [displaysById, pinnedViewer, visibleSlots],
  );

  const endDrag = useCallback(() => {
    if (!pinnedViewer) return;
    if (dragHeightPx != null) {
      pinnedViewer.setViewerHeightPx(dragHeightPx, { persist: true });
    }
    dragStateRef.current = null;
    setDragHeightPx(null);
  }, [dragHeightPx, pinnedViewer]);

  useEffect(() => {
    if (dragHeightPx == null) return;
    const onMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || !pinnedViewer) return;
      const delta = event.clientY - drag.startY;
      const next = normalizePinnedViewerHeight(
        drag.startHeight + delta,
        typeof window !== "undefined" ? window.innerHeight : undefined,
      );
      const capped = Math.min(next, maxPinnedHeightPx);
      setDragHeightPx(capped);
    };
    const onUp = () => endDrag();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragHeightPx, endDrag, maxPinnedHeightPx, pinnedViewer]);

  useEffect(() => {
    if (count === 0) return;
    const content = contentRef.current;
    const outer = outerBandRef.current;
    if (!content || !outer || typeof window === "undefined") return;

    const contentRect = content.getBoundingClientRect();
    const outerRect = outer.getBoundingClientRect();
    const contentStyle = window.getComputedStyle(content);
    logPinnedBandLayoutSnapshot({
      pinnedDisplayCount: count,
      viewerHeightPx: pinnedViewer?.viewerHeightPx ?? 0,
      effectiveViewerHeightPx,
      bandStyleHeight: content.style.height,
      bandComputedHeight: contentRect.height,
      bandMinHeight: contentStyle.minHeight,
      bandMaxHeight: contentStyle.maxHeight,
      resizeHandleHeight: RESIZE_HANDLE_HEIGHT_PX,
      outerBandComputedHeight: outerRect.height,
      firstPinnedBandFailureStage: evaluatePinnedBandFailureStage({
        pinnedDisplayCount: count,
        effectiveViewerHeightPx,
        contentComputedHeight: contentRect.height,
        outerComputedHeight: outerRect.height,
        handleHeightPx: RESIZE_HANDLE_HEIGHT_PX,
      }),
    });
  }, [count, effectiveViewerHeightPx, pinnedViewer?.viewerHeightPx]);

  if (!pinnedViewer || count === 0) {
    return pinnedViewer?.pinMessage ? (
      <div className="px-4 pt-2 lg:px-6">
        <Alert variant="info">{pinnedViewer.pinMessage}</Alert>
      </div>
    ) : null;
  }

  const reorderStack =
    reorderStackId == null
      ? null
      : (visibleSlots.find(
          (slot): slot is Extract<(typeof visibleSlots)[number], { kind: "stack" }> =>
            slot.kind === "stack" && slot.stackId === reorderStackId,
        ) ?? null);

  const gridClass = COLUMN_CLASS[Math.min(4, Math.max(1, count))] ?? "grid-cols-4";
  const contentHeightStyle = `${effectiveViewerHeightPx}px`;

  return (
    <div
      ref={outerBandRef}
      className="relative isolate flex w-full max-w-full shrink-0 flex-col overflow-hidden border-b border-border bg-surface"
      data-pinned-viewer-band=""
      data-pinned-content-fit-height={contentFitHeightPx}
      data-pinned-max-height={maxPinnedHeightPx}
      style={{
        flex: "0 0 auto",
        minHeight: `${effectiveViewerHeightPx + RESIZE_HANDLE_HEIGHT_PX}px`,
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {pinnedViewer.pinMessage ? (
        <div className="shrink-0 px-4 pt-2 lg:px-6">
          <Alert variant="info">{pinnedViewer.pinMessage}</Alert>
        </div>
      ) : null}
      <div
        ref={contentRef}
        className="relative box-border max-w-full shrink-0 overflow-hidden px-3 pb-1 pt-2 lg:px-5"
        data-pinned-viewer-content=""
        data-pinned-viewer-height={effectiveViewerHeightPx}
        style={{
          height: contentHeightStyle,
          minHeight: contentHeightStyle,
          maxHeight: contentHeightStyle,
          flex: "0 0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div
          className={`grid h-full min-h-0 grid-rows-1 gap-2 overflow-hidden [&>*]:min-h-0 [&>*]:min-w-0 ${gridClass}`}
        >
          {visibleSlots.map((slot) => {
            if (slot.kind === "stack") {
              return (
                <PinnedDisplayStackSlot
                  key={slot.stackId}
                  projectId={pinnedViewer.projectId}
                  slot={slot}
                  displaysById={displaysById}
                  configuredBandHeightPx={effectiveViewerHeightPx}
                  onContextMenu={(event) => openStackMenu(event, slot)}
                />
              );
            }
            const display = displaysById.get(slot.displayId);
            if (!display) return null;
            return (
              <PinnedDisplayLiveSlot
                key={display.id}
                projectId={pinnedViewer.projectId}
                display={display}
                configuredBandHeightPx={effectiveViewerHeightPx}
                onContextMenu={(event) => openSingleDisplayMenu(event, display.id)}
              />
            );
          })}
        </div>
      </div>
      {reorderStack ? (
        <ReorderPinnedStackModal
          key={reorderStack.stackId}
          initialDisplayIds={reorderStack.orderedMemberDisplayIds}
          displayNamesById={
            new Map(pinnedDisplays.map((display) => [display.id, display.name]))
          }
          onSave={(orderedIds) => pinnedViewer.reorderStack(reorderStack.stackId, orderedIds)}
          onClose={() => setReorderStackId(null)}
        />
      ) : null}
      <PinnedViewerContextMenu
        open={menu != null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menu?.items ?? []}
        onClose={closeMenu}
      />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize pinned display viewer"
        className="relative z-10 flex w-full shrink-0 cursor-ns-resize items-center justify-center overflow-hidden border-t border-border/80 bg-background/80 hover:bg-primary/10"
        style={{
          height: `${RESIZE_HANDLE_HEIGHT_PX}px`,
          minHeight: `${RESIZE_HANDLE_HEIGHT_PX}px`,
          flex: "0 0 auto",
          touchAction: "none",
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragStateRef.current = {
            startY: event.clientY,
            startHeight: effectiveViewerHeightPx,
          };
          setDragHeightPx(effectiveViewerHeightPx);
        }}
      >
        <span className="pointer-events-none h-1 w-16 rounded-full bg-border group-hover:bg-primary/50" />
      </div>
    </div>
  );
}
