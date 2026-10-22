"use client";

type OnAirSourceOption<T extends string> = {
  value: T;
  label: string;
};

type ProjectOnAirSourceToggleProps<T extends string> = {
  label?: string;
  options: ReadonlyArray<OnAirSourceOption<T>>;
  value: T;
  disabled?: boolean;
  ariaLabel?: string;
  onSelect: (value: T) => void;
};

/**
 * Shared segmented on-air source selector (project-specific option labels).
 * Does not navigate — callers persist the active source through project APIs.
 */
export function ProjectOnAirSourceToggle<T extends string>({
  label,
  options,
  value,
  disabled = false,
  ariaLabel = "On-air data source",
  onSelect,
}: ProjectOnAirSourceToggleProps<T>) {
  return (
    <div
      className="flex shrink-0 items-center gap-3 self-center"
      role="group"
      aria-label={ariaLabel}
    >
      {label ? <span className="text-sm text-muted">{label}</span> : null}
      <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => {
                if (!disabled && !selected) onSelect(option.value);
              }}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? "bg-primary text-white"
                  : "text-muted hover:bg-surface-raised hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
