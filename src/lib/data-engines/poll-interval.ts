import { POLL_PRESETS_MS, POLL_SLIDER_STEPS_MS } from "@/lib/data-engines/constants";

export function pollIntervalToSliderIndex(ms: number): number {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < POLL_SLIDER_STEPS_MS.length; index += 1) {
    const distance = Math.abs(POLL_SLIDER_STEPS_MS[index] - ms);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }

  return closestIndex;
}

export function sliderIndexToPollIntervalMs(index: number): number {
  const clampedIndex = Math.max(
    0,
    Math.min(POLL_SLIDER_STEPS_MS.length - 1, Math.round(index)),
  );
  return POLL_SLIDER_STEPS_MS[clampedIndex];
}

export function snapPollIntervalMs(ms: number): number {
  if ((POLL_PRESETS_MS as readonly number[]).includes(ms)) {
    return ms;
  }
  return sliderIndexToPollIntervalMs(pollIntervalToSliderIndex(ms));
}

export const POLL_SLIDER_MAX_INDEX = POLL_SLIDER_STEPS_MS.length - 1;
