export const BACKGROUND_REFRESH_PRESETS_MS = [
  5000,
  10_000,
  30_000,
  60_000,
  300_000,
] as const;

export const LEGACY_POLL_PRESETS_MS = [250, 500, 1000, 2500, 5000, 10_000] as const;

export const BACKGROUND_REFRESH_SLIDER_STEPS_MS = [
  5000, 7500, 10_000, 15_000, 20_000, 30_000, 45_000, 60_000, 90_000, 120_000, 180_000, 300_000,
] as const;

export const DEFAULT_BACKGROUND_REFRESH_MS = 10_000;
export const DEFAULT_LEGACY_POLL_MS = 1000;

export const BACKGROUND_REFRESH_SLIDER_MAX_INDEX =
  BACKGROUND_REFRESH_SLIDER_STEPS_MS.length - 1;

export function backgroundRefreshIntervalToSliderIndex(ms: number): number {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < BACKGROUND_REFRESH_SLIDER_STEPS_MS.length; index += 1) {
    const distance = Math.abs(BACKGROUND_REFRESH_SLIDER_STEPS_MS[index] - ms);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }
  return closestIndex;
}

export function backgroundRefreshSliderIndexToMs(index: number): number {
  const clampedIndex = Math.max(
    0,
    Math.min(BACKGROUND_REFRESH_SLIDER_STEPS_MS.length - 1, Math.round(index)),
  );
  return BACKGROUND_REFRESH_SLIDER_STEPS_MS[clampedIndex];
}

export function snapBackgroundRefreshIntervalMs(ms: number): number {
  if ((BACKGROUND_REFRESH_PRESETS_MS as readonly number[]).includes(ms)) {
    return ms;
  }
  return backgroundRefreshSliderIndexToMs(backgroundRefreshIntervalToSliderIndex(ms));
}

export function formatScraperTimingPresetLabel(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return Number.isInteger(seconds) ? `${seconds} sec` : `${seconds} sec`;
  }
  const minutes = ms / 60_000;
  return Number.isInteger(minutes) ? `${minutes} minute` : `${minutes} minutes`;
}

export function nearestPresetMs(
  valueMs: number,
  presets: readonly number[],
  fallback: number,
): number {
  if (!Number.isFinite(valueMs) || valueMs <= 0) {
    return fallback;
  }
  if (presets.includes(valueMs as (typeof presets)[number])) {
    return valueMs;
  }
  let nearest = presets[0] ?? fallback;
  let smallestDelta = Math.abs(valueMs - nearest);
  for (const preset of presets) {
    const delta = Math.abs(valueMs - preset);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      nearest = preset;
    }
  }
  return nearest;
}

export function backgroundRefreshSelectOptions(currentMs: number) {
  const presets: number[] = [...BACKGROUND_REFRESH_PRESETS_MS];
  if (Number.isFinite(currentMs) && currentMs > 0 && !presets.includes(currentMs)) {
    presets.push(currentMs);
    presets.sort((left, right) => left - right);
  }
  return presets;
}

export function legacyPollSelectOptions(currentMs: number) {
  const presets: number[] = [...LEGACY_POLL_PRESETS_MS];
  if (Number.isFinite(currentMs) && currentMs > 0 && !presets.includes(currentMs)) {
    presets.push(currentMs);
    presets.sort((left, right) => left - right);
  }
  return presets;
}
