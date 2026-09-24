"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragCancelEvent,
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
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { DeveloperHtmlDisplayCard } from "@/components/displays/DeveloperHtmlDisplayCard";
import { BroadArrowTypedDisplayCard } from "@/components/displays/broad-arrow/BroadArrowTypedDisplayCard";
import { DisplayCard } from "@/components/displays/DisplayCard";
import { Alert } from "@/components/ui/Alert";
import { requestPinnedViewerRefresh } from "@/lib/displays/pinned-viewer-context";
import { localSaveDisplayOrder } from "@/lib/local/display-order-api";
import { useDisplayInlinePreview } from "@/lib/displays/display-inline-preview-context";
import {
  buildCustomDisplayListItem,
  type DisplayListItem,
} from "@/lib/displays/displays-list-types";
import { isBroadArrowRendererKey } from "@/lib/displays/broad-arrow/renderer-keys";
import {
  notifyDisplayConnectionChanged,
  requestDisplayViewerReload,
} from "@/lib/displays/display-connection-client";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type DuplicateDisplayPayload = {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  displayKey: string;
  description: string | null;
  sourceType: "built-in" | "project-html";
  enabled: boolean;
  archived: boolean;
  refreshRateMs: number;
  displayWidth?: number;
  displayHeight?: number;
  publishedRevisionId: string | null;
  activeVersion?: {
    id: string;
    versionNumber: number;
    createdAt: string;
  };
};

type DisplaysListClientProps = {
  projectSlug: string;
  projectId: string;
  items: DisplayListItem[];
  onItemsChange: Dispatch<SetStateAction<DisplayListItem[]>>;
  hasLiveSnapshot: boolean;
  canReorder: boolean;
  canDeveloperTools: boolean;
  onDragActiveChange?: (active: boolean) => void;
};

type SortableDisplayCardProps = {
  item: DisplayListItem;
  disabled: boolean;
  canReorder: boolean;
  children: ReactNode;
};

function SortableDisplayCard({
  item,
  disabled,
  canReorder,
  children,
}: SortableDisplayCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.persistId,
    disabled: !canReorder || disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.25 : 1,
    touchAction: canReorder && !disabled ? ("none" as const) : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={canReorder && !disabled ? "cursor-grab active:cursor-grabbing" : undefined}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

export function DisplaysListClient({
  projectSlug,
  projectId,
  items,
  onItemsChange,
  hasLiveSnapshot,
  canReorder,
  canDeveloperTools,
  onDragActiveChange,
}: DisplaysListClientProps) {
  const { clearDisplay } = useDisplayInlinePreview();
  const [busy, setBusy] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const savedItemsRef = useRef<DisplayListItem[] | null>(null);
  const saveRequestRef = useRef(0);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (!shouldUseLocalDataClient()) return;

    for (const item of items) {
      if (item.kind !== "registry" || item.display.enabled) continue;
      notifyDisplayConnectionChanged(item.display.id, false);
      requestDisplayViewerReload(item.display.id);
    }
  }, [items]);

  async function persistOrder(nextItems: DisplayListItem[], rollbackItems: DisplayListItem[]) {
    if (!canReorder) return;
    const requestId = ++saveRequestRef.current;
    setBusy(true);
    setOrderError(null);
    try {
      await localSaveDisplayOrder(
        projectSlug,
        projectId,
        nextItems.map((item) => item.persistId),
      );
      requestPinnedViewerRefresh();
      if (requestId !== saveRequestRef.current) return;
    } catch (error) {
      if (requestId !== saveRequestRef.current) return;
      onItemsChange(rollbackItems);
      setOrderError(
        error instanceof Error ? error.message : "Could not save display order.",
      );
    } finally {
      if (requestId === saveRequestRef.current) {
        setBusy(false);
      }
    }
  }

  function handleDisplayArchived(displayId: string) {
    onItemsChange((current) => current.filter((item) => item.persistId !== displayId));
  }

  function handleDisplayDeleted(displayId: string) {
    clearDisplay(projectId, displayId);
    onItemsChange((current) => current.filter((item) => item.persistId !== displayId));
  }

  function handleDisplayDuplicated(
    duplicate: DuplicateDisplayPayload,
    sourceDisplayId: string,
  ) {
    if (duplicate.archived || duplicate.sourceType !== "project-html") {
      return;
    }

    const newItem = buildCustomDisplayListItem({
      ...duplicate,
      sourceType: "project-html",
      publishedRevisionId: duplicate.publishedRevisionId ?? "",
      displayWidth: duplicate.displayWidth ?? 1920,
      displayHeight: duplicate.displayHeight ?? 1080,
      activeVersion: duplicate.activeVersion ?? {
        id: duplicate.publishedRevisionId ?? "v1",
        versionNumber: 1,
        createdAt: new Date().toISOString(),
      },
    });

    onItemsChange((current) => {
      const sourceIndex = current.findIndex((item) => item.persistId === sourceDisplayId);
      if (sourceIndex === -1) {
        return [...current, newItem];
      }
      const next = [...current];
      next.splice(sourceIndex + 1, 0, newItem);
      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    savedItemsRef.current = itemsRef.current;
    setActiveId(String(event.active.id));
    onDragActiveChange?.(true);
  }

  function handleDragCancel(_event: DragCancelEvent) {
    if (savedItemsRef.current) {
      onItemsChange(savedItemsRef.current);
    }
    savedItemsRef.current = null;
    setActiveId(null);
    onDragActiveChange?.(false);
  }

  function handleDragEnd(event: DragEndEvent) {
    const baseline = savedItemsRef.current ?? itemsRef.current;
    savedItemsRef.current = null;
    setActiveId(null);
    onDragActiveChange?.(false);

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const activeItemId = String(active.id);
    const overItemId = String(over.id);
    const oldIndex = baseline.findIndex((item) => item.persistId === activeItemId);
    const newIndex = baseline.findIndex((item) => item.persistId === overItemId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return;
    }

    const nextItems = arrayMove(baseline, oldIndex, newIndex);
    onItemsChange(nextItems);
    void persistOrder(nextItems, baseline);
  }

  function renderCard(item: DisplayListItem): ReactNode {
    const listCallbacks = {
      onArchived: handleDisplayArchived,
      onDeleted: handleDisplayDeleted,
      onDuplicated: (duplicate: DuplicateDisplayPayload) =>
        handleDisplayDuplicated(duplicate, item.persistId),
    };

    if (item.kind === "registry") {
      return (
        <DisplayCard
          display={item.display}
          initialEnabled={item.display.enabled}
          hasLiveSnapshot={hasLiveSnapshot}
          projectSlug={projectSlug}
          projectId={projectId}
          displayPersistId={item.persistId}
          initialRefreshRateMs={item.refreshRateMs}
          initialDisplayWidth={item.displayWidth}
          initialDisplayHeight={item.displayHeight}
          canDeveloperTools={canDeveloperTools}
          cardDescription={item.cardDescription}
          activeVersionNumber={item.activeVersionNumber}
          activeVersionCreatedAt={item.activeVersionCreatedAt}
          developerDisplay={item.developerDisplay}
          {...listCallbacks}
        />
      );
    }

    if (item.kind === "custom" && item.rendererKey && isBroadArrowRendererKey(item.rendererKey)) {
      return (
        <BroadArrowTypedDisplayCard
          projectSlug={projectSlug}
          projectId={projectId}
          rendererKey={item.rendererKey}
          display={item.display}
          refreshRateMs={item.refreshRateMs}
          canDeveloperTools={canDeveloperTools}
          activeVersionNumber={item.activeVersionNumber}
          activeVersionCreatedAt={item.activeVersionCreatedAt}
          displayWidth={item.displayWidth}
          displayHeight={item.displayHeight}
          {...listCallbacks}
        />
      );
    }

    return (
      <DeveloperHtmlDisplayCard
        projectSlug={projectSlug}
        projectId={projectId}
        display={item.display}
        refreshRateMs={item.refreshRateMs}
        canDeveloperTools={canDeveloperTools}
        activeVersionNumber={item.activeVersionNumber}
        activeVersionCreatedAt={item.activeVersionCreatedAt}
        displayWidth={item.displayWidth}
        displayHeight={item.displayHeight}
        {...listCallbacks}
      />
    );
  }

  const activeItem = activeId
    ? items.find((item) => item.persistId === activeId) ?? null
    : null;

  const listBody = (
    <div className="space-y-6">
      {orderError ? <Alert variant="error">{orderError}</Alert> : null}
      {items.map((item) => (
        <SortableDisplayCard
          key={item.persistId}
          item={item}
          disabled={busy}
          canReorder={canReorder}
        >
          {renderCard(item)}
        </SortableDisplayCard>
      ))}
    </div>
  );

  if (!canReorder) {
    return listBody;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={items.map((item) => item.persistId)}
        strategy={verticalListSortingStrategy}
      >
        {listBody}
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
        {activeItem ? (
          <div className="scale-[1.01] opacity-95 shadow-xl">{renderCard(activeItem)}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
