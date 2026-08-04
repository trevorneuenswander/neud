"use client";

import { useEffect, useId, useRef, useState } from "react";

export type DeveloperToolsMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
  separatorBefore?: boolean;
};

type DeveloperToolsDropdownProps = {
  label?: string;
  items: DeveloperToolsMenuItem[];
  align?: "left" | "right";
};

export function DeveloperToolsDropdown({
  label = "Developer Tools",
  items,
  align = "right",
}: DeveloperToolsDropdownProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const menu = containerRef.current?.querySelector('[role="menu"]');
    const firstItem = menu?.querySelector('[role="menuitem"]:not([disabled])') as
      | HTMLButtonElement
      | undefined;
    firstItem?.focus();
  }, [open]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="inline-flex items-center rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={`absolute z-50 mt-1 min-w-[14rem] rounded-md border border-border bg-surface py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item) => (
            <div key={item.id}>
              {item.separatorBefore ? (
                <div role="separator" className="my-1 border-t border-border" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={`block w-full cursor-pointer px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:text-muted ${
                  item.variant === "destructive"
                    ? "text-danger hover:bg-danger/10 focus-visible:bg-danger/10"
                    : "text-foreground hover:bg-surface-raised focus-visible:bg-surface-raised"
                }`}
                onClick={() => {
                  if (item.disabled) {
                    return;
                  }
                  item.onSelect();
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
