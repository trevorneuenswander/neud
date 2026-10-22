"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  resolveSubmenuPlacement,
  type SubmenuPlacement,
} from "@/lib/displays/context-menu-placement";

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

const DEFAULT_PLACEMENT: SubmenuPlacement = { openLeft: false, offsetTop: 0 };

function SubmenuItemRow({
  item,
  onClose,
}: {
  item: Extract<PinnedViewerMenuItem, { kind: "submenu" }>;
  onClose: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<SubmenuPlacement>(DEFAULT_PLACEMENT);

  const recomputePlacement = useCallback(() => {
    const row = rowRef.current;
    const panel = panelRef.current;
    const menu = row?.closest("[data-pinned-viewer-context-menu]") as HTMLElement | null;
    if (!row || !panel || !menu) return;

    const menuRect = menu.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const next = resolveSubmenuPlacement({
      menuRect: {
        left: menuRect.left,
        right: menuRect.right,
        top: rowRect.top,
        bottom: menuRect.bottom,
      },
      submenuWidth: panel.offsetWidth || 200,
      submenuHeight: panel.offsetHeight || 0,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    setPlacement(next);
  }, []);

  return (
    <div
      ref={rowRef}
      className="group relative"
      data-submenu-item={item.id}
      data-submenu-open-left={placement.openLeft ? "true" : "false"}
      data-submenu-offset-top={String(placement.offsetTop)}
      onMouseEnter={recomputePlacement}
      onFocus={recomputePlacement}
    >
      <div className="px-3 py-1.5 text-foreground hover:bg-surface">{item.label} ›</div>
      <div
        ref={panelRef}
        role="menu"
        data-submenu-panel={item.id}
        data-submenu-placement={placement.openLeft ? "left" : "right"}
        className={[
          "invisible absolute top-0 z-[2001] min-w-[200px] rounded-md border border-border bg-surface-raised py-1 opacity-0 shadow-lg",
          "group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
          placement.openLeft ? "right-full left-auto" : "left-full",
        ].join(" ")}
        style={{ top: placement.offsetTop }}
      >
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

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={rootRef}
      role="menu"
      data-pinned-viewer-context-menu=""
      className="fixed z-[2000] min-w-[220px] rounded-md border border-border bg-surface-raised py-1 text-sm shadow-lg"
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
          return <SubmenuItemRow key={item.id} item={item} onClose={onClose} />;
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
    </div>,
    document.body,
  );
}

export { resolveSubmenuPlacement } from "@/lib/displays/context-menu-placement";
