"use client";

import { useId, useState, type ReactNode } from "react";

type DisclosureSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  open?: boolean;
  headerAction?: ReactNode;
  /** When true, children mount only while open (avoids duplicate hidden iframes). */
  lazyMount?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function DisclosureSection({
  title,
  children,
  className = "",
  contentClassName = "",
  defaultOpen = false,
  open: controlledOpen,
  headerAction,
  lazyMount = false,
  onOpenChange,
}: DisclosureSectionProps) {
  const panelId = useId();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  function setOpen(next: boolean) {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  }

  function handleToggle() {
    setOpen(!open);
  }

  return (
    <div className={`rounded-lg border border-border bg-surface ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 text-left text-sm font-semibold text-foreground focus-visible:outline-none"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={handleToggle}
        >
          <span>{title}</span>
          <span
            aria-hidden="true"
            className={`inline-block shrink-0 text-xs text-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${
              open ? "rotate-90" : "rotate-0"
            }`}
          >
            ▸
          </span>
        </button>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className={`border-t border-border px-4 pb-4 pt-4 ${contentClassName}`}>
            {!lazyMount || open ? children : null}
          </div>
        </div>
      </div>
    </div>
  );
}
