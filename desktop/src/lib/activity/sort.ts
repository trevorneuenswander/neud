export type ActivitySortableEvent = {
  id: string;
  createdAt?: string | null;
  occurredAt?: string | null;
  timestamp?: string | null;
};

function readActivityTimestamp(event: ActivitySortableEvent): number {
  const raw =
    (typeof event.createdAt === "string" && event.createdAt) ||
    (typeof event.occurredAt === "string" && event.occurredAt) ||
    (typeof event.timestamp === "string" && event.timestamp) ||
    "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareActivityEventsNewestFirst(
  left: ActivitySortableEvent,
  right: ActivitySortableEvent,
): number {
  const timeDelta = readActivityTimestamp(right) - readActivityTimestamp(left);
  if (timeDelta !== 0) {
    return timeDelta;
  }
  return right.id.localeCompare(left.id);
}

/** Returns a new array sorted newest-first with a stable id tie-breaker. */
export function sortActivityEventsNewestFirst<T extends ActivitySortableEvent>(
  events: readonly T[],
): T[] {
  return [...events].sort(compareActivityEventsNewestFirst);
}

export function selectNewestActivityEvents<T extends ActivitySortableEvent>(
  events: readonly T[],
  maxItems: number,
): T[] {
  return sortActivityEventsNewestFirst(events).slice(0, maxItems);
}
