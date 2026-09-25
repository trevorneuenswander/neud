"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PinnedDisplayLiveSlot } from "@/components/displays/PinnedDisplayLiveSlot";
import { PinnedDisplayStackSlot } from "@/components/displays/PinnedDisplayStackSlot";
import { PinnedViewerContextMenu } from "@/components/displays/PinnedViewerContextMenu";
import { Alert } from "@/components/ui/Alert";
import { usePinnedViewer } from "@/lib/displays/pinned-viewer-context";
import {
  buildSinglePinnedDisplayMenuItems,
  buildStackPinnedDisplayMenuItems,
} from "@/lib/displays/pinned-viewer-context-menu-items";
import {
  evaluatePinnedBandFailureStage,
  logPinnedBandLayoutSnapshot,
} from "@/lib/displays/pinned-viewer-band-diagnostics";
import {
  clampPinnedViewerHeight,
  MIN_PINNED_VIEWER_HEIGHT_PX,
  normalizePinnedViewerHeight,
} from "@/lib/displays/pinned-viewer-preference";
import type { PinnedViewerMenuItem } from "@/components/displays/PinnedViewerContextMenu";

const COLUMN_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

const RESIZE_HANDLE_HEIGHT_PX = 12;

type MenuState = {
  x: number;
  y: number;
  items: PinnedViewerMenuItem[];
};

export function PinnedDisplayViewerArea() {
  const pinnedViewer = usePinnedViewer();
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [dragHeightPx, setDragHeightPx] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outerBandRef = useRef<HTMLDivElement>(null);

  const visibleSlots = pinnedViewer?.visibleSlots ?? [];
  const pinnedDisplays = pinnedViewer?.pinnedDisplays ?? [];
  const count = visibleSlots.length;

  const displaysById = useMemo(
    () => new Map(pinnedDisplays.map((display) => [display.id, display])),
    [pinnedDisplays],
  );

  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : undefined;
  const rawHeightPx = dragHeightPx ?? pinnedViewer?.viewerHeightPx;
  const effectiveViewerHeightPx = normalizePinnedViewerHeight(rawHeightPx, viewportHeight);

  const closeMenu = useCallback(() => setMenu(null), []);

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
        onAddToStack: (target) => {
          void pinnedViewer.addDisplayToStack(displayId, target);
        },
      });
      setMenu({ x: event.clientX, y: event.clientY, items });
    },
    [displaysById, pinnedViewer],
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
        onRemoveFromStack: (memberDisplayId) => {
          void pinnedViewer.removeDisplayFromStack(slot.stackId, memberDisplayId);
        },
      });
      setMenu({ x: event.clientX, y: event.clientY, items });
    },
    [displaysById, pinnedViewer, visibleSlots],
  );

  const maxContentHeightPx = () => {
    const projectRoot = contentRef.current?.closest(".project-layout-root");
    const shellMain = contentRef.current?.closest(".main-content");
    const anchor = projectRoot ?? shellMain;
    const anchorHeight = anchor?.getBoundingClientRect().height ?? window.innerHeight;
    return clampPinnedViewerHeight(Math.floor(anchorHeight * 0.5), anchorHeight);
  };

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
        window.innerHeight,
      );
      const capped = Math.min(next, maxContentHeightPx());
      setDragHeightPx(capped);
    };
    const onUp = () => endDrag();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragHeightPx, endDrag, pinnedViewer]);

  useEffect(() => {
    if (count === 0) return;
    const content = contentRef.current;
    const outer = outerBandRef.current;
    if (!content || !outer) return;

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

  const gridClass = COLUMN_CLASS[Math.min(4, Math.max(1, count))] ?? "grid-cols-4";
  const contentHeightStyle = `${effectiveViewerHeightPx}px`;

  return (
    <div
      ref={outerBandRef}
      className="relative isolate flex w-full max-w-full shrink-0 flex-col overflow-hidden border-b border-border bg-surface"
      data-pinned-viewer-band=""
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
          minHeight: `${MIN_PINNED_VIEWER_HEIGHT_PX}px`,
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
