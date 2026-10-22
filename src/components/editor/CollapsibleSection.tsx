"use client";

import type { ReactNode } from "react";

type CollapsibleSectionProps = {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <section className="border-b border-neutral-800 last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-400 hover:bg-neutral-900/80"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="text-neutral-500" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? <div className="px-3 pb-3">{children}</div> : null}
    </section>
  );
}
