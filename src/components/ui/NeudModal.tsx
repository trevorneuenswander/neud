"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { OverlayCloseButton } from "@/components/ui/OverlayCloseButton";

type NeudModalProps = {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  icon?: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
};

export function NeudModal({
  title,
  description,
  children,
  onClose,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
  icon,
  footer,
  initialFocusRef,
}: NeudModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const focusTarget = initialFocusRef?.current ?? dialogRef.current;
    focusTarget?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (closeOnEscape && event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeOnEscape, handleClose, initialFocusRef]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-lg outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {icon ? (
              <div aria-hidden="true" className="mt-0.5 shrink-0">
                {icon}
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <h3 id={titleId} className="text-lg font-semibold text-foreground">
                {title}
              </h3>
              {description ? (
                <div id={descriptionId} className="mt-2 text-sm text-muted">
                  {description}
                </div>
              ) : null}
            </div>
          </div>
          {showCloseButton ? <OverlayCloseButton onClick={handleClose} /> : null}
        </div>

        {children ? <div className="mt-4">{children}</div> : null}

        {footer ? <div className="mt-5">{footer}</div> : null}
      </div>
    </div>
  );
}
