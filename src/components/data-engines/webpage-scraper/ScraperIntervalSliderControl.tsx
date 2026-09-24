"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { formatPollInterval } from "@/lib/data-engines/format";
import {
  POLL_SLIDER_MAX_INDEX,
  pollIntervalToSliderIndex,
  sliderIndexToPollIntervalMs,
  snapPollIntervalMs,
} from "@/lib/data-engines/poll-interval";
import {
  BACKGROUND_REFRESH_SLIDER_MAX_INDEX,
  backgroundRefreshIntervalToSliderIndex,
  backgroundRefreshSliderIndexToMs,
  snapBackgroundRefreshIntervalMs,
} from "@/lib/bag/scraper-timing-presets";

function formatPresetLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return Number.isInteger(seconds) ? `${seconds}s` : `${seconds}s`;
  }
  return `${ms / 60_000}m`;
}

export function ScraperIntervalSliderControl({
  title,
  intervalMs,
  presets,
  mode,
  disabled = false,
  onIntervalChange,
}: {
  title: string;
  intervalMs: number;
  presets: readonly number[];
  mode: "legacy-poll" | "background-refresh";
  disabled?: boolean;
  onIntervalChange: (nextMs: number) => void | Promise<void>;
}) {
  const snap = useCallback(
    (ms: number) =>
      mode === "legacy-poll" ? snapPollIntervalMs(ms) : snapBackgroundRefreshIntervalMs(ms),
    [mode],
  );

  const [activeIntervalMs, setActiveIntervalMs] = useState(() => snap(intervalMs));
  const [sliderDraftMs, setSliderDraftMs] = useState(() => snap(intervalMs));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const synced = snap(intervalMs);
    setActiveIntervalMs(synced);
    setSliderDraftMs(synced);
  }, [intervalMs, snap]);

  const applyInterval = useCallback(
    async (nextMs: number) => {
      const snappedMs = snap(nextMs);
      if (snappedMs === activeIntervalMs) {
        return;
      }

      const previousMs = activeIntervalMs;
      setError(null);
      setSaving(true);
      setSliderDraftMs(snappedMs);
      setActiveIntervalMs(snappedMs);

      try {
        await onIntervalChange(snappedMs);
      } catch (applyError) {
        setActiveIntervalMs(previousMs);
        setSliderDraftMs(previousMs);
        setError(
          applyError instanceof Error ? applyError.message : "Unable to update interval.",
        );
      } finally {
        setSaving(false);
      }
    },
    [activeIntervalMs, onIntervalChange, snap],
  );

  const commitSliderInterval = useCallback(() => {
    void applyInterval(sliderDraftMs);
  }, [applyInterval, sliderDraftMs]);

  const sliderIndex =
    mode === "legacy-poll"
      ? pollIntervalToSliderIndex(sliderDraftMs)
      : backgroundRefreshIntervalToSliderIndex(sliderDraftMs);

  const sliderMaxIndex =
    mode === "legacy-poll" ? POLL_SLIDER_MAX_INDEX : BACKGROUND_REFRESH_SLIDER_MAX_INDEX;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {formatPollInterval(activeIntervalMs)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={activeIntervalMs === preset ? "primary" : "secondary"}
            disabled={disabled || saving}
            onClick={() => void applyInterval(preset)}
          >
            {formatPresetLabel(preset)}
          </Button>
        ))}
      </div>

      <div>
        <p className="cursor-default text-sm font-medium text-foreground">
          Custom interval: {formatPollInterval(sliderDraftMs)}
        </p>
        <p className="mt-1 cursor-default text-xs text-muted">
          {mode === "legacy-poll"
            ? "Drag the slider to choose a value between 1 second and 60 minutes. The interval applies when you release the slider."
            : "Drag the slider to choose a background refresh interval. The interval applies when you release the slider."}
        </p>
        <input
          type="range"
          min={0}
          max={sliderMaxIndex}
          step={1}
          value={sliderIndex}
          disabled={disabled || saving}
          onChange={(event) => {
            const index = Number(event.target.value);
            const nextMs =
              mode === "legacy-poll"
                ? sliderIndexToPollIntervalMs(index)
                : backgroundRefreshSliderIndexToMs(index);
            setSliderDraftMs(nextMs);
          }}
          onPointerUp={commitSliderInterval}
          onKeyUp={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              commitSliderInterval();
            }
          }}
          className="mt-2 w-full cursor-pointer [&::-moz-range-thumb]:cursor-grab [&::-webkit-slider-thumb]:cursor-grab active:[&::-moz-range-thumb]:cursor-grabbing active:[&::-webkit-slider-thumb]:cursor-grabbing"
          aria-label={`${title} slider`}
        />
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  );
}
