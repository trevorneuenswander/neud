"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState, useEffect, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import {
  HostedDisplayCard,
  type HostedDisplayCardDisplay,
} from "@/components/hosted/HostedDisplayCard";
import { reorderHostedProjectDisplays } from "@/lib/hosted/display-order-api";
import { useHostedProjectDisplayListPoll } from "@/lib/hosted/use-hosted-project-display-list-poll";

type HostedProjectDisplaysClientProps = {
  projectId: string;
  projectSlug: string;
  initialDisplays: HostedDisplayCardDisplay[];
  canReorder: boolean;
};

type SortableHostedDisplayRowProps = {
  display: HostedDisplayCardDisplay;
  projectSlug: string;
  canReorder: boolean;
  dragDisabled: boolean;
  previewPaused: boolean;
};

function SortableHostedDisplayRow({
  display,
  projectSlug,
  canReorder,
  dragDisabled,
  previewPaused,
}: SortableHostedDisplayRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: display.id,
    disabled: !canReorder || dragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.25 : 1,
    touchAction: canReorder && !dragDisabled ? ("none" as const) : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={canReorder && !dragDisabled ? "cursor-grab active:cursor-grabbing" : undefined}
      {...attributes}
      {...listeners}
    >
      <HostedDisplayCard
        projectSlug={projectSlug}
        display={display}
        previewPaused={previewPaused}
      />
    </div>
  );
}

export function HostedProjectDisplaysClient({
  projectId,
  projectSlug,
  initialDisplays,
  canReorder,
}: HostedProjectDisplaysClientProps) {
  const { displays: polledDisplays } = useHostedProjectDisplayListPoll({
    projectId,
    initialDisplays,
  });
  const [displays, setDisplays] = useState(polledDisplays);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplays((current) => {
      const order = current.map((display) => display.id);
      const byId = new Map(polledDisplays.map((display) => [display.id, display]));
      return order
        .map((id) => byId.get(id))
        .filter((display): display is HostedDisplayCardDisplay => Boolean(display));
    });
  }, [polledDisplays]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeDisplay = useMemo(
    () => displays.find((display) => display.id === activeId) ?? null,
    [activeId, displays],
  );

  async function persistOrder(nextDisplays: HostedDisplayCardDisplay[], previous: HostedDisplayCardDisplay[]) {
    setSaving(true);
    setError(null);
    const result = await reorderHostedProjectDisplays({
      projectId,
      displayIds: nextDisplays.map((display) => display.id),
    });
    setSaving(false);
    if (!result.ok) {
      setDisplays(previous);
      setError(result.message ?? "Unable to save display order.");
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!canReorder || saving) {
      return;
    }
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = displays.findIndex((display) => display.id === active.id);
    const newIndex = displays.findIndex((display) => display.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    const previous = displays;
    const next = arrayMove(displays, oldIndex, newIndex);
    setDisplays(next);
    void persistOrder(next, previous);
  }

  const dragInProgress = activeId !== null || saving;

  let overlay: ReactNode = null;
  if (activeDisplay) {
    overlay = (
      <Card className="pointer-events-none opacity-90 shadow-lg">
        <HostedDisplayCard projectSlug={projectSlug} display={activeDisplay} previewPaused />
      </Card>
    );
  }

  if (displays.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted">
        No active displays are available for this project.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {saving ? <p className="text-xs text-muted">Saving display order…</p> : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={displays.map((display) => display.id)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-4">
            {displays.map((display) => (
              <SortableHostedDisplayRow
                key={display.id}
                display={display}
                projectSlug={projectSlug}
                canReorder={canReorder}
                dragDisabled={saving || activeId !== null}
                previewPaused={dragInProgress}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>{overlay}</DragOverlay>
      </DndContext>
    </div>
  );
}
