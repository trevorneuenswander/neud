export const DEFAULT_DISPLAY_REFRESH_RATE_MS = 5000;

export const DISPLAY_REFRESH_RATE_OPTIONS = [
  { label: "1s", valueMs: 1000 },
  { label: "2.5s", valueMs: 2500 },
  { label: "5s", valueMs: 5000 },
  { label: "10s", valueMs: 10000 },
  { label: "30s", valueMs: 30000 },
  { label: "60s", valueMs: 60000 },
] as const;

export const ALLOWED_DISPLAY_REFRESH_RATE_MS = DISPLAY_REFRESH_RATE_OPTIONS.map(
  (option) => option.valueMs,
);

export function isAllowedDisplayRefreshRateMs(refreshRateMs: number): boolean {
  return ALLOWED_DISPLAY_REFRESH_RATE_MS.includes(
    refreshRateMs as (typeof ALLOWED_DISPLAY_REFRESH_RATE_MS)[number],
  );
}

export function normalizeDisplayRefreshRateMs(
  refreshRateMs: number | null | undefined,
): number {
  if (
    typeof refreshRateMs === "number" &&
    isAllowedDisplayRefreshRateMs(refreshRateMs)
  ) {
    return refreshRateMs;
  }

  return DEFAULT_DISPLAY_REFRESH_RATE_MS;
}

export function formatDisplayRefreshRateLabel(refreshRateMs: number): string {
  const option = DISPLAY_REFRESH_RATE_OPTIONS.find(
    (entry) => entry.valueMs === refreshRateMs,
  );
  return option?.label ?? `${Math.round(refreshRateMs / 1000)}s`;
}
