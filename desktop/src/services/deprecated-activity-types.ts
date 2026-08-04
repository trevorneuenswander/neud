export const DEPRECATED_ACTIVITY_TYPES = new Set([
  "controller.lot-updated",
  "controller.bid-updated",
  "display.fullscreen",
  "display.fullscreen-opened",
  "offline.export.failed",
  "offline.export.adapter-resolved",
]);

export function isDeprecatedActivityType(type: string): boolean {
  return DEPRECATED_ACTIVITY_TYPES.has(type);
}

export function filterDeprecatedActivityEntries<T extends { type: string }>(
  entries: T[],
): T[] {
  return entries.filter((entry) => !isDeprecatedActivityType(entry.type));
}
