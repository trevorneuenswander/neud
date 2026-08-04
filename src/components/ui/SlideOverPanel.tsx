"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { OverlayCloseButton } from "@/components/ui/OverlayCloseButton";

type SlideOverPanelProps = {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  closeDisabled?: boolean;
};

export function SlideOverPanel({
  title,
  subtitle,
  open,
  onClose,
  children,
  closeDisabled = false,
}: SlideOverPanelProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const overlayRoot = document.getElementById("neud-overlay-root") ?? document.body;

  return createPortal(
    <div className="absolute inset-0 flex">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-background/70"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative ml-auto flex h-full w-full max-w-5xl flex-col border-l border-border bg-surface shadow-xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-foreground">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          </div>
          <OverlayCloseButton onClick={onClose} disabled={closeDisabled} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </aside>
    </div>,
    overlayRoot,
  );
}
