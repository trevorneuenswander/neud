"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type SidebarTooltipProps = {
  label: string;
  children: ReactNode;
  disabled?: boolean;
};

const SHOW_DELAY_MS = 400;

export function SidebarTooltip({ label, children, disabled = false }: SidebarTooltipProps) {
  const tooltipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  function updatePosition() {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPosition({
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  }

  function show() {
    if (disabled) return;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      updatePosition();
      setVisible(true);
    }, SHOW_DELAY_MS);
  }

  function hide() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }

  const portalRoot =
    typeof document !== "undefined"
      ? document.getElementById("neud-overlay-root") ?? document.body
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        className="block min-w-0"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={visible ? tooltipId : undefined}
      >
        {children}
      </span>
      {visible && portalRoot
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed z-[300] -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-foreground shadow-lg"
              style={{ top: position.top, left: position.left }}
            >
              {label}
            </div>,
            portalRoot,
          )
        : null}
    </>
  );
}
