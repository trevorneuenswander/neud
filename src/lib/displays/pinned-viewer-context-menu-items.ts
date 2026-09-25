import type { PinnedViewerMenuItem } from "@/components/displays/PinnedViewerContextMenu";
import type { PinnedViewerDisplaySummary } from "@/lib/local/pinned-viewer-api";
import {
  listCompatibleStackTargets,
  pickDefaultStackTarget,
  type VisiblePinnedSlot,
} from "@/lib/displays/pinned-viewer-stacks";

export function buildSinglePinnedDisplayMenuItems(input: {
  displayId: string;
  visibleSlots: VisiblePinnedSlot[];
  displaysById: Map<string, PinnedViewerDisplaySummary>;
  onUnpin: () => void;
  onAddToStack: (
    target:
      | { kind: "display"; displayId: string }
      | { kind: "stack"; stackId: string },
  ) => void;
}): PinnedViewerMenuItem[] {
  const items: PinnedViewerMenuItem[] = [
    {
      kind: "action",
      id: "unpin",
      label: "Un-Pin",
      onSelect: input.onUnpin,
    },
  ];

  const dimensionsById = new Map(
    [...input.displaysById.values()].map((display) => [
      display.id,
      { id: display.id, width: display.width, height: display.height },
    ]),
  );
  const summariesById = new Map(
    [...input.displaysById.values()].map((display) => [display.id, { name: display.name }]),
  );

  const sourceSlotIndex = input.visibleSlots.findIndex(
    (slot) => slot.kind === "single" && slot.displayId === input.displayId,
  );

  const targets = listCompatibleStackTargets({
    sourceDisplayId: input.displayId,
    visibleSlots: input.visibleSlots,
    displaysById: dimensionsById,
    displaySummariesById: summariesById,
  });

  if (targets.length === 0) {
    return items;
  }

  const defaultTarget = pickDefaultStackTarget(targets, sourceSlotIndex);
  const orderedTargets =
    defaultTarget && targets.length > 1
      ? [
          defaultTarget,
          ...targets.filter((target) => target !== defaultTarget),
        ]
      : targets;

  items.push({
    kind: "submenu",
    id: "add-to-stack",
    label: "Add to Stack",
    items: orderedTargets.map((target) => ({
      id:
        target.kind === "display"
          ? `stack-into-${target.displayId}`
          : `stack-into-${target.stackId}`,
      label: target.label,
      onSelect: () => {
        if (target.kind === "display") {
          input.onAddToStack({ kind: "display", displayId: target.displayId });
        } else {
          input.onAddToStack({ kind: "stack", stackId: target.stackId });
        }
      },
    })),
  });

  return items;
}

export function buildStackPinnedDisplayMenuItems(input: {
  slot: Extract<VisiblePinnedSlot, { kind: "stack" }>;
  displaysById: Map<string, PinnedViewerDisplaySummary>;
  onUnpinStack: () => void;
  onRemoveFromStack: (displayId: string) => void;
}): PinnedViewerMenuItem[] {
  const orderedNames = input.slot.orderedMemberDisplayIds.map((id, index, all) => {
    const name = input.displaysById.get(id)?.name ?? id;
    if (index === 0) return `[Top] ${name}`;
    if (index === all.length - 1) return `[Bottom] ${name}`;
    return name;
  });

  const items: PinnedViewerMenuItem[] = [
    {
      kind: "action",
      id: "unpin-stack",
      label: "Un-Pin",
      onSelect: input.onUnpinStack,
    },
    {
      kind: "submenu",
      id: "remove-from-stack",
      label: "Remove from Stack",
      items: input.slot.orderedMemberDisplayIds.map((displayId) => ({
        id: `remove-${displayId}`,
        label: input.displaysById.get(displayId)?.name ?? displayId,
        onSelect: () => input.onRemoveFromStack(displayId),
      })),
    },
    {
      kind: "heading",
      id: "layers-heading",
      label: "Layers",
    },
    ...orderedNames.map((label, index) => ({
      kind: "heading" as const,
      id: `layer-${index}`,
      label: `${index + 1}. ${label}`,
    })),
  ];

  return items;
}
