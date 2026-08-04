"use client";

import {
  DISPLAY_REFRESH_RATE_OPTIONS,
  normalizeDisplayRefreshRateMs,
} from "@/lib/displays/refresh-rate";

type DisplayRefreshRateSelectProps = {
  valueMs: number;
  disabled?: boolean;
  showLabel?: boolean;
  onChange: (refreshRateMs: number) => void;
};

export function DisplayRefreshRateSelect({
  valueMs,
  disabled = false,
  showLabel = true,
  onChange,
}: DisplayRefreshRateSelectProps) {
  const normalizedValueMs = normalizeDisplayRefreshRateMs(valueMs);

  const selectControl = (
    <span className="relative inline-flex min-w-[5.5rem] items-center">
      <select
        className="w-full cursor-pointer appearance-none rounded-md border border-border bg-surface py-1 pl-2 pr-7 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        value={normalizedValueMs}
        disabled={disabled}
        aria-label="Refresh Rate"
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {DISPLAY_REFRESH_RATE_OPTIONS.map((option) => (
          <option key={option.valueMs} value={option.valueMs}>
            {option.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted"
      >
        ▼
      </span>
    </span>
  );

  if (!showLabel) {
    return selectControl;
  }

  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="whitespace-nowrap">Refresh Rate</span>
      {selectControl}
    </label>
  );
}
