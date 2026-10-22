"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { NeudModal } from "@/components/ui/NeudModal";

type ReorderPinnedStackModalProps = {
  /** Display ids TOP first … BOTTOM last. */
  initialDisplayIds: string[];
  displayNamesById: Map<string, string>;
  onSave: (orderedDisplayIds: string[]) => Promise<boolean>;
  onClose: () => void;
};

function StackRow({
  id,
  name,
  position,
  total,
  disabled,
}: {
  id: string;
  name: string;
  position: number;
  total: number;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const badge = position === 0 ? "Top" : position === total - 1 ? "Bottom" : null;

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        touchAction: "none",
      }}
      className="flex cursor-grab items-center gap-3 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <span aria-hidden="true" className="select-none text-muted">
        ⋮⋮
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">{name}</span>
      {badge ? (
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {badge}
        </span>
      ) : null}
    </li>
  );
}

export function ReorderPinnedStackModal({
  initialDisplayIds,
  displayNamesById,
  onSave,
  onClose,
}: ReorderPinnedStackModalProps) {
  const [orderedIds, setOrderedIds] = useState(initialDisplayIds);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const changed = orderedIds.some((id, index) => id !== initialDisplayIds[index]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedIds((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  async function handleSave() {
    if (saving) return;
    if (!changed) {
      onClose();
      return;
    }
    setSaving(true);
    const saved = await onSave(orderedIds);
    setSaving(false);
    if (saved) {
      onClose();
    }
  }

  // Portal out of the pinned band, which is an isolated stacking context.
  return createPortal(
    <NeudModal
      title="Reorder Stack"
      description="Drag displays to set the layer order. The top of the list appears above the others."
      onClose={onClose}
      closeOnBackdrop={false}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={saving || !changed} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2" aria-label="Stack layers, top to bottom">
            {orderedIds.map((id, index) => (
              <StackRow
                key={id}
                id={id}
                name={displayNamesById.get(id) ?? id}
                position={index}
                total={orderedIds.length}
                disabled={saving}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </NeudModal>,
    document.body,
  );
}
