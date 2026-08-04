export const PROTECTED_DISPLAY_KEYS = new Set([
  "pylon",
  "lower-ticker-v5",
  "new-bid-display-v1",
  "new-ticker-v1",
]);

export function isProtectedDisplayKey(displayKey: string): boolean {
  return PROTECTED_DISPLAY_KEYS.has(displayKey);
}
