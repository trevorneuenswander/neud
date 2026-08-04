/** Activity types excluded from user-facing feeds (still stored in history). */
export const NOISY_ACTIVITY_TYPES = new Set([
  "scraper.interval-changed",
  "display.connection",
  "controller.lot-status",
]);

export function isNoisyActivityType(type: string): boolean {
  return NOISY_ACTIVITY_TYPES.has(type);
}

export function filterNoisyActivityEntries<T extends { type: string }>(entries: T[]): T[] {
  return entries.filter((entry) => !isNoisyActivityType(entry.type));
}
