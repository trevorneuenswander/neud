"use client";

import { DISPLAY_SIZE_OPTIONS } from "@/lib/displays/display-size";

type DisplaySizeSelectProps = {
  displayWidth: number;
  displayHeight: number;
  disabled?: boolean;
  showLabel?: boolean;
  onChange: (width: number, height: number) => void;
};

export function DisplaySizeSelect({
  displayWidth,
  displayHeight,
  disabled = false,
  showLabel = true,
  onChange,
}: DisplaySizeSelectProps) {
  const currentValue = `${displayWidth}x${displayHeight}`;

  const selectControl = (
    <select
      aria-label="Display Size"
      className="min-w-[5.5rem] cursor-pointer rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      value={currentValue}
      onChange={(event) => {
        const option = DISPLAY_SIZE_OPTIONS.find(
          (entry) => entry.label === event.target.value,
        );
        if (option) {
          onChange(option.width, option.height);
        }
      }}
    >
      {DISPLAY_SIZE_OPTIONS.map((option) => (
        <option key={option.label} value={option.label}>
          {option.label}
        </option>
      ))}
    </select>
  );

  if (!showLabel) {
    return selectControl;
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted">
      <span>Display Size</span>
      {selectControl}
    </label>
  );
}
