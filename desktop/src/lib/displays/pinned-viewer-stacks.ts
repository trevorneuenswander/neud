import {
  MAX_PINNED_VISIBLE_SLOTS,
  orderPinnedDisplayIds,
  parsePinnedDisplayIds,
  type PinnedViewerEligibleDisplay,
} from "./pinned-viewer-preference";

export const MAX_VISIBLE_PINNED_SLOTS = MAX_PINNED_VISIBLE_SLOTS;

export const MAX_PINNED_DISPLAYS_MESSAGE =
  "Maximum of 4 pinned display windows.";

export type PinnedStackRecord = {
  id: string;
  displayIds: string[];
};

export type PinnedDisplayDimensions = {
  id: string;
  width: number;
  height: number;
};

export type VisiblePinnedSingleSlot = {
  kind: "single";
  displayId: string;
  sortKeyDisplayId: string;
};

export type VisiblePinnedStackSlot = {
  kind: "stack";
  stackId: string;
  memberDisplayIds: string[];
  orderedMemberDisplayIds: string[];
  baseDisplayId: string;
  sortKeyDisplayId: string;
  aspectRatioKey: string;
};

export type VisiblePinnedSlot = VisiblePinnedSingleSlot | VisiblePinnedStackSlot;

export function normalizeAspectRatioKey(width: number, height: number): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  let a = w;
  let b = h;
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  const gcd = Math.max(1, a);
  return `${w / gcd}:${h / gcd}`;
}

export function areDisplaysStackCompatible(
  a: Pick<PinnedDisplayDimensions, "width" | "height">,
  b: Pick<PinnedDisplayDimensions, "width" | "height">,
): boolean {
  const w1 = Math.round(a.width);
  const h1 = Math.round(a.height);
  const w2 = Math.round(b.width);
  const h2 = Math.round(b.height);
  if (w1 <= 0 || h1 <= 0 || w2 <= 0 || h2 <= 0) {
    return false;
  }
  return w1 * h2 === w2 * h1;
}

export function parsePinnedStacks(raw: unknown): PinnedStackRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const stacks: PinnedStackRecord[] = [];
  const seenStackIds = new Set<string>();
  const seenMembers = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const displayIds = parsePinnedDisplayIds(record.displayIds);
    if (!id || displayIds.length < 2) continue;
    if (seenStackIds.has(id)) continue;
    if (displayIds.some((memberId) => seenMembers.has(memberId))) continue;
    seenStackIds.add(id);
    for (const memberId of displayIds) {
      seenMembers.add(memberId);
    }
    stacks.push({ id, displayIds });
  }
  return stacks;
}

export function orderStackMemberIds(
  memberIds: string[],
  displayListOrderIds: string[],
): string[] {
  const memberSet = new Set(memberIds);
  return displayListOrderIds.filter((id) => memberSet.has(id));
}

export function stackBaseDisplayId(
  memberIds: string[],
  displayListOrderIds: string[],
): string {
  const ordered = orderStackMemberIds(memberIds, displayListOrderIds);
  return ordered[ordered.length - 1] ?? memberIds[0] ?? "";
}

export function deriveVisiblePinnedSlots(input: {
  pinnedDisplayIds: string[];
  stacks: PinnedStackRecord[];
  displayListOrderIds: string[];
  displaysById: Map<string, PinnedDisplayDimensions>;
}): VisiblePinnedSlot[] {
  const pinnedSet = new Set(parsePinnedDisplayIds(input.pinnedDisplayIds));
  const displayToStack = new Map<string, string>();

  for (const stack of input.stacks) {
    const orderedMembers = orderStackMemberIds(stack.displayIds, input.displayListOrderIds).filter(
      (id) => pinnedSet.has(id),
    );
    if (orderedMembers.length < 2) {
      continue;
    }
    for (const memberId of orderedMembers) {
      displayToStack.set(memberId, stack.id);
    }
  }

  const slots: VisiblePinnedSlot[] = [];
  const emittedStacks = new Set<string>();

  for (const displayId of input.displayListOrderIds) {
    if (!pinnedSet.has(displayId)) continue;
    const stackId = displayToStack.get(displayId);
    if (stackId) {
      if (emittedStacks.has(stackId)) continue;
      emittedStacks.add(stackId);
      const stack = input.stacks.find((entry) => entry.id === stackId);
      if (!stack) continue;
      const orderedMemberDisplayIds = orderStackMemberIds(stack.displayIds, input.displayListOrderIds).filter(
        (id) => pinnedSet.has(id),
      );
      if (orderedMemberDisplayIds.length < 2) continue;
      const baseDisplayId = stackBaseDisplayId(
        orderedMemberDisplayIds,
        input.displayListOrderIds,
      );
      const baseDisplay = input.displaysById.get(baseDisplayId);
      const aspectRatioKey = baseDisplay
        ? normalizeAspectRatioKey(baseDisplay.width, baseDisplay.height)
        : "unknown";
      slots.push({
        kind: "stack",
        stackId,
        memberDisplayIds: orderedMemberDisplayIds,
        orderedMemberDisplayIds,
        baseDisplayId,
        sortKeyDisplayId: baseDisplayId,
        aspectRatioKey,
      });
      continue;
    }

    slots.push({
      kind: "single",
      displayId,
      sortKeyDisplayId: displayId,
    });
  }

  return slots.sort((left, right) => {
    const leftIndex = input.displayListOrderIds.indexOf(left.sortKeyDisplayId);
    const rightIndex = input.displayListOrderIds.indexOf(right.sortKeyDisplayId);
    return leftIndex - rightIndex;
  });
}

export function countVisiblePinnedSlots(input: {
  pinnedDisplayIds: string[];
  stacks: PinnedStackRecord[];
  displayListOrderIds: string[];
  displaysById: Map<string, PinnedDisplayDimensions>;
}): number {
  return deriveVisiblePinnedSlots(input).length;
}

function stackMembersCompatible(
  memberIds: string[],
  displaysById: Map<string, PinnedDisplayDimensions>,
): boolean {
  if (memberIds.length < 2) return false;
  const first = displaysById.get(memberIds[0]!);
  if (!first) return false;
  for (let index = 1; index < memberIds.length; index += 1) {
    const next = displaysById.get(memberIds[index]!);
    if (!next || !areDisplaysStackCompatible(first, next)) {
      return false;
    }
  }
  return true;
}

export function sanitizePinnedViewerStacks(input: {
  pinnedDisplayIds: string[];
  stacks: PinnedStackRecord[];
  displays: PinnedViewerEligibleDisplay[];
  displayListOrderIds: string[];
  displaysById: Map<string, PinnedDisplayDimensions>;
}): {
  pinnedDisplayIds: string[];
  stacks: PinnedStackRecord[];
  removedDisplayIds: string[];
} {
  const eligibleById = new Map(input.displays.map((display) => [display.id, display]));
  const pinnedSet = new Set<string>();
  const removedDisplayIds: string[] = [];

  for (const id of parsePinnedDisplayIds(input.pinnedDisplayIds)) {
    const display = eligibleById.get(id);
    if (!display || display.archived || !display.enabled) {
      removedDisplayIds.push(id);
      continue;
    }
    pinnedSet.add(id);
  }

  const pinnedDisplayIds = orderPinnedDisplayIds([...pinnedSet], input.displayListOrderIds);
  const nextStacks: PinnedStackRecord[] = [];
  const assigned = new Set<string>();

  for (const stack of parsePinnedStacks(input.stacks)) {
    const members = orderStackMemberIds(stack.displayIds, input.displayListOrderIds).filter((id) =>
      pinnedSet.has(id),
    );
    const uniqueMembers = members.filter((id) => {
      if (assigned.has(id)) return false;
      return true;
    });
    if (uniqueMembers.length < 2) {
      continue;
    }
    if (!stackMembersCompatible(uniqueMembers, input.displaysById)) {
      continue;
    }
    for (const memberId of uniqueMembers) {
      assigned.add(memberId);
    }
    nextStacks.push({
      id: stack.id,
      displayIds: uniqueMembers,
    });
  }

  return {
    pinnedDisplayIds,
    stacks: nextStacks,
    removedDisplayIds,
  };
}

export function createStackId(displayIds: string[]): string {
  const sorted = [...new Set(displayIds.map((id) => id.trim()).filter(Boolean))].sort();
  return `stack:${sorted.join("|")}`;
}

export function wouldExceedVisibleSlotLimit(input: {
  pinnedDisplayIds: string[];
  stacks: PinnedStackRecord[];
  displayListOrderIds: string[];
  displaysById: Map<string, PinnedDisplayDimensions>;
}): boolean {
  return (
    countVisiblePinnedSlots(input) >= MAX_VISIBLE_PINNED_SLOTS
  );
}

export function buildAddToStackPreference(input: {
  sourceDisplayId: string;
  target:
    | { kind: "display"; displayId: string }
    | { kind: "stack"; stackId: string };
  pinnedDisplayIds: string[];
  stacks: PinnedStackRecord[];
  displayListOrderIds: string[];
  displaysById: Map<string, PinnedDisplayDimensions>;
}): { pinnedDisplayIds: string[]; stacks: PinnedStackRecord[] } {
  const sourceId = input.sourceDisplayId.trim();
  if (!sourceId) {
    throw new Error("Display is required.");
  }
  const pinnedSet = new Set(parsePinnedDisplayIds(input.pinnedDisplayIds));
  if (!pinnedSet.has(sourceId)) {
    throw new Error("Only pinned displays can be stacked.");
  }

  const sourceDisplay = input.displaysById.get(sourceId);
  if (!sourceDisplay) {
    throw new Error("Display not found.");
  }

  let stacks = parsePinnedStacks(input.stacks);
  const sourceStack = stacks.find((stack) => stack.displayIds.includes(sourceId));
  if (sourceStack) {
    throw new Error("Display is already in a stack.");
  }

  const target = input.target;
  if (target.kind === "display") {
    const targetId = target.displayId.trim();
    if (targetId === sourceId) {
      throw new Error("Cannot stack a display with itself.");
    }
    if (!pinnedSet.has(targetId)) {
      throw new Error("Target display is not pinned.");
    }
    const targetStack = stacks.find((stack) => stack.displayIds.includes(targetId));
    const targetDisplay = input.displaysById.get(targetId);
    if (!targetDisplay || !areDisplaysStackCompatible(sourceDisplay, targetDisplay)) {
      throw new Error("Displays must share the same aspect ratio to stack.");
    }
    if (targetStack) {
      const mergedIds = [...targetStack.displayIds, sourceId];
      if (!stackMembersCompatible(mergedIds, input.displaysById)) {
        throw new Error("Displays must share the same aspect ratio to stack.");
      }
      stacks = stacks.map((stack) =>
        stack.id === targetStack.id
          ? { id: stack.id, displayIds: mergedIds }
          : stack,
      );
    } else {
      const memberIds = [targetId, sourceId];
      stacks = [...stacks, { id: createStackId(memberIds), displayIds: memberIds }];
    }
  } else if (target.kind === "stack") {
    const targetStack = stacks.find((stack) => stack.id === target.stackId);
    if (!targetStack) {
      throw new Error("Stack not found.");
    }
    const mergedIds = [...targetStack.displayIds, sourceId];
    if (!stackMembersCompatible(mergedIds, input.displaysById)) {
      throw new Error("Displays must share the same aspect ratio to stack.");
    }
    stacks = stacks.map((stack) =>
      stack.id === targetStack.id ? { id: stack.id, displayIds: mergedIds } : stack,
    );
  } else {
    throw new Error("Invalid stack target.");
  }

  return {
    pinnedDisplayIds: input.pinnedDisplayIds,
    stacks,
  };
}

export function buildRemoveFromStackPreference(input: {
  stackId: string;
  displayId: string;
  pinnedDisplayIds: string[];
  stacks: PinnedStackRecord[];
  displayListOrderIds: string[];
  displaysById: Map<string, PinnedDisplayDimensions>;
}): { pinnedDisplayIds: string[]; stacks: PinnedStackRecord[] } {
  const stackId = input.stackId.trim();
  const displayId = input.displayId.trim();
  const stack = input.stacks.find((entry) => entry.id === stackId);
  if (!stack || !stack.displayIds.includes(displayId)) {
    throw new Error("Display is not in this stack.");
  }

  const nextMembers = stack.displayIds.filter((id) => id !== displayId);
  let stacks = input.stacks.filter((entry) => entry.id !== stackId);
  if (nextMembers.length >= 2) {
    stacks = [...stacks, { id: stack.id, displayIds: nextMembers }];
  }

  const nextVisible = countVisiblePinnedSlots({
    pinnedDisplayIds: input.pinnedDisplayIds,
    stacks,
    displayListOrderIds: input.displayListOrderIds,
    displaysById: input.displaysById,
  });
  if (nextVisible > MAX_VISIBLE_PINNED_SLOTS) {
    throw new Error(MAX_PINNED_DISPLAYS_MESSAGE);
  }

  return {
    pinnedDisplayIds: input.pinnedDisplayIds,
    stacks,
  };
}

export function buildUnpinStackPreference(input: {
  stackId: string;
  pinnedDisplayIds: string[];
  stacks: PinnedStackRecord[];
}): { pinnedDisplayIds: string[]; stacks: PinnedStackRecord[] } {
  const stack = input.stacks.find((entry) => entry.id === input.stackId.trim());
  if (!stack) {
    throw new Error("Stack not found.");
  }
  const removeSet = new Set(stack.displayIds);
  return {
    pinnedDisplayIds: input.pinnedDisplayIds.filter((id) => !removeSet.has(id)),
    stacks: input.stacks.filter((entry) => entry.id !== stack.id),
  };
}

export function listCompatibleStackTargets(input: {
  sourceDisplayId: string;
  visibleSlots: VisiblePinnedSlot[];
  displaysById: Map<string, PinnedDisplayDimensions>;
  displaySummariesById: Map<string, { name: string }>;
}): Array<
  | { kind: "display"; displayId: string; label: string; slotIndex: number }
  | { kind: "stack"; stackId: string; label: string; slotIndex: number }
> {
  const sourceId = input.sourceDisplayId.trim();
  const sourceDisplay = input.displaysById.get(sourceId);
  if (!sourceDisplay) return [];

  const targets: Array<
    | { kind: "display"; displayId: string; label: string; slotIndex: number }
    | { kind: "stack"; stackId: string; label: string; slotIndex: number }
  > = [];

  input.visibleSlots.forEach((slot, slotIndex) => {
    if (slot.kind === "single") {
      if (slot.displayId === sourceId) return;
      const targetDisplay = input.displaysById.get(slot.displayId);
      if (!targetDisplay || !areDisplaysStackCompatible(sourceDisplay, targetDisplay)) {
        return;
      }
      const label = input.displaySummariesById.get(slot.displayId)?.name ?? slot.displayId;
      targets.push({ kind: "display", displayId: slot.displayId, label, slotIndex });
      return;
    }
    if (slot.memberDisplayIds.includes(sourceId)) return;
    const anchor = input.displaysById.get(slot.baseDisplayId);
    if (!anchor || !areDisplaysStackCompatible(sourceDisplay, anchor)) return;
    const names = slot.orderedMemberDisplayIds
      .map((id) => input.displaySummariesById.get(id)?.name ?? id)
      .join(" + ");
    targets.push({
      kind: "stack",
      stackId: slot.stackId,
      label: `Stack: ${names}`,
      slotIndex,
    });
  });

  return targets.sort((left, right) => left.slotIndex - right.slotIndex);
}

export function pickDefaultStackTarget<
  T extends { slotIndex: number },
>(targets: T[], sourceSlotIndex: number): T | null {
  if (targets.length === 0) return null;
  const left = [...targets]
    .filter((target) => target.slotIndex < sourceSlotIndex)
    .sort((a, b) => b.slotIndex - a.slotIndex);
  return left[0] ?? targets[0] ?? null;
}

export function layerZIndexForDisplayInStack(
  displayId: string,
  orderedMemberDisplayIds: string[],
): number {
  const index = orderedMemberDisplayIds.indexOf(displayId);
  if (index < 0) return 1;
  return orderedMemberDisplayIds.length - index;
}
