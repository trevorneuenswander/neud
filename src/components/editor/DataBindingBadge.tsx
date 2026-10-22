"use client";

type DataBindingBadgeProps = {
  label: string;
  visible?: boolean;
};

export function DataBindingBadge({ label, visible = true }: DataBindingBadgeProps) {
  if (!visible || !label.trim()) return null;

  return (
    <span className="pointer-events-none inline-flex max-w-[160px] truncate rounded bg-sky-950/90 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-sky-200 ring-1 ring-sky-800/60">
      {label}
    </span>
  );
}
