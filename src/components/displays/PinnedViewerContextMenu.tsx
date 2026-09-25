"use client";

import { useEffect, useRef } from "react";

export type PinnedViewerMenuItem =
  | {
      kind: "action";
      id: string;
      label: string;
      onSelect: () => void;
      disabled?: boolean;
    }
  | {
      kind: "submenu";
      id: string;
      label: string;
      items: Array<{ id: string; label: string; onSelect: () => void; disabled?: boolean }>;
    }
  | {
      kind: "heading";
      id: string;
      label: string;
    };

type PinnedViewerContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  items: PinnedViewerMenuItem[];
  onClose: () => void;
};

export function PinnedViewerContextMenu({
  open,
  x,
  y,
  items,
  onClose,
}: PinnedViewerContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      role="menu"
      className="fixed z-[200] min-w-[220px] rounded-md border border-border bg-surface-raised py-1 text-sm shadow-lg"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => {
        if (item.kind === "heading") {
          return (
            <div
              key={item.id}
              className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted"
            >
              {item.label}
            </div>
          );
        }
        if (item.kind === "submenu") {
          return (
            <div key={item.id} className="group relative">
              <div className="px-3 py-1.5 text-foreground hover:bg-surface">{item.label} ›</div>
              <div className="invisible absolute left-full top-0 z-[201] min-w-[200px] rounded-md border border-border bg-surface-raised py-1 opacity-0 shadow-lg group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                {item.items.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    disabled={entry.disabled}
                    className="block w-full px-3 py-1.5 text-left hover:bg-surface disabled:opacity-50"
                    onClick={() => {
                      entry.onSelect();
                      onClose();
                    }}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className="block w-full px-3 py-1.5 text-left hover:bg-surface disabled:opacity-50"
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
