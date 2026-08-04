"use client";

type ProjectAssignmentCheckboxProps = {
  id: string;
  checked: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

export function ProjectAssignmentCheckbox({
  id,
  checked,
  disabled = false,
  indeterminate = false,
  label,
  onChange,
}: ProjectAssignmentCheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={`group inline-flex items-center gap-2 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        ref={(node) => {
          if (node) {
            node.indeterminate = indeterminate;
          }
        }}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className="flex h-5 w-5 items-center justify-center rounded-md border border-border bg-surface text-primary transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-checked:border-primary peer-checked:bg-primary/15 group-hover:border-primary/60 peer-disabled:group-hover:border-border"
      >
        <svg
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 transition-opacity ${checked || indeterminate ? "opacity-100" : "opacity-0"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {indeterminate ? (
            <path d="M4 8h8" />
          ) : (
            <path d="M4 8.5 7 11.5 12 5" />
          )}
        </svg>
      </span>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}
