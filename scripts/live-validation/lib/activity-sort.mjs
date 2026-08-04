export function readActivityTimestamp(event) {
  const raw =
    (typeof event.createdAt === "string" && event.createdAt) ||
    (typeof event.occurredAt === "string" && event.occurredAt) ||
    (typeof event.timestamp === "string" && event.timestamp) ||
    "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareActivityEventsNewestFirst(left, right) {
  const timeDelta = readActivityTimestamp(right) - readActivityTimestamp(left);
  if (timeDelta !== 0) {
    return timeDelta;
  }
  return right.id.localeCompare(left.id);
}

export function sortActivityEventsNewestFirst(events) {
  return [...events].sort(compareActivityEventsNewestFirst);
}

export function selectNewestActivityEvents(events, maxItems) {
  return sortActivityEventsNewestFirst(events).slice(0, maxItems);
}
