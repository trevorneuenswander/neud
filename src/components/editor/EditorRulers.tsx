"use client";

import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  RULER_THICKNESS_PX,
  buildRulerTicks,
  createPersistentGuide,
  isGuideOffCanvas,
  removeGuide,
  rulerMajorStep,
  updateGuidePosition,
} from "@/lib/editor/rulers";
import type { EditableGuide } from "@/lib/editor/editable-graphic-types";

type EditorRulersProps = {
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  visible: boolean;
  guides: EditableGuide[];
  onGuideSessionStart: () => void;
  onGuidesPreview: (guides: EditableGuide[]) => void;
  onGuideSessionEnd: (guides: EditableGuide[]) => void;
  children: ReactNode;
};

export function EditorRulers({
  canvasWidth,
  canvasHeight,
  scale,
  visible,
  guides,
  onGuideSessionStart,
  onGuidesPreview,
  onGuideSessionEnd,
  children,
}: EditorRulersProps) {
  const dragRef = useRef<{
    guideId: string;
    orientation: "horizontal" | "vertical";
  } | null>(null);
  const workingGuidesRef = useRef(guides);

  useEffect(() => {
    workingGuidesRef.current = guides;
  }, [guides]);

  function preview(next: EditableGuide[]) {
    workingGuidesRef.current = next;
    onGuidesPreview(next);
  }

  if (!visible) {
    return <>{children}</>;
  }

  const xStep = rulerMajorStep(canvasWidth);
  const yStep = rulerMajorStep(canvasHeight);
  const xTicks = buildRulerTicks(canvasWidth, xStep);
  const yTicks = buildRulerTicks(canvasHeight, yStep);

  function canvasPositionFromEvent(
    event: ReactPointerEvent,
    orientation: "horizontal" | "vertical",
  ): number | null {
    const host = (event.currentTarget as HTMLElement).closest("[data-ruler-host]");
    const stage = host?.querySelector("[data-editor-stage]") as HTMLElement | null;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    return orientation === "vertical"
      ? (event.clientX - rect.left) / scale
      : (event.clientY - rect.top) / scale;
  }

  function startGuideFromRuler(
    event: ReactPointerEvent,
    orientation: "horizontal" | "vertical",
  ) {
    event.preventDefault();
    const position = canvasPositionFromEvent(event, orientation);
    if (position == null) return;
    onGuideSessionStart();
    const guide = createPersistentGuide(orientation, position);
    preview([...workingGuidesRef.current, guide]);
    dragRef.current = { guideId: guide.id, orientation };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveGuide(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const position = canvasPositionFromEvent(event, drag.orientation);
    if (position == null) return;
    preview(updateGuidePosition(workingGuidesRef.current, drag.guideId, position));
  }

  function endGuide(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const guide = workingGuidesRef.current.find((entry) => entry.id === drag.guideId);
    let next = workingGuidesRef.current;
    if (guide && isGuideOffCanvas(guide, canvasWidth, canvasHeight)) {
      next = removeGuide(workingGuidesRef.current, drag.guideId);
    }
    onGuideSessionEnd(next);
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  return (
    <div
      data-ruler-host
      className="relative inline-grid"
      style={{
        gridTemplateColumns: `${RULER_THICKNESS_PX}px auto`,
        gridTemplateRows: `${RULER_THICKNESS_PX}px auto`,
      }}
      onPointerMove={moveGuide}
      onPointerUp={endGuide}
      onPointerLeave={endGuide}
    >
      <div className="border-b border-r border-neutral-700 bg-neutral-900" />
      <div
        className="relative cursor-crosshair border-b border-neutral-700 bg-neutral-900 text-[9px] text-neutral-500"
        onPointerDown={(event) => startGuideFromRuler(event, "horizontal")}
      >
        <div
          className="relative h-full"
          style={{ width: canvasWidth * scale, height: RULER_THICKNESS_PX }}
        >
          {xTicks.map((tick) => (
            <span
              key={`x-${tick}`}
              className="absolute bottom-0 border-l border-neutral-600 pl-0.5"
              style={{ left: tick * scale, height: tick % (xStep * 2) === 0 ? 14 : 8 }}
            >
              {tick % (xStep * 2) === 0 ? tick : ""}
            </span>
          ))}
        </div>
      </div>
      <div
        className="relative cursor-crosshair border-r border-neutral-700 bg-neutral-900 text-[9px] text-neutral-500"
        onPointerDown={(event) => startGuideFromRuler(event, "vertical")}
      >
        <div
          className="relative"
          style={{ width: RULER_THICKNESS_PX, height: canvasHeight * scale }}
        >
          {yTicks.map((tick) => (
            <span
              key={`y-${tick}`}
              className="absolute right-0 border-t border-neutral-600 pr-0.5 text-right"
              style={{ top: tick * scale, width: tick % (yStep * 2) === 0 ? 14 : 8 }}
            >
              {tick % (yStep * 2) === 0 ? tick : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
