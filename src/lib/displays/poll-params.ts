export const DEFAULT_POLL_MS = 1000;
export const MIN_POLL_MS = 1000;

export function parsePollIntervalMs(value: string | null | undefined): number {
  const parsed = Number(value ?? DEFAULT_POLL_MS);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_POLL_MS;
  }

  return Math.max(MIN_POLL_MS, Math.trunc(parsed));
}
