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
  /** default = max-w-lg; wide = max-w-4xl; xl = large settings surfaces */
  size?: "default" | "wide" | "xl";
};

const MODAL_SIZE_CLASS: Record<NonNullable<NeudModalProps["size"]>, string> = {
  default: "max-w-lg",
  wide: "max-w-4xl",
  xl: "max-w-6xl",
};

const MODAL_HEIGHT_CLASS: Record<NonNullable<NeudModalProps["size"]>, string> = {
  default: "max-h-[min(90vh,42rem)]",
  wide: "max-h-[min(90vh,42rem)]",
  xl: "max-h-[min(92vh,56rem)]",
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
  size = "default",
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
        className={`flex ${MODAL_HEIGHT_CLASS[size]} w-full ${MODAL_SIZE_CLASS[size]} flex-col rounded-lg border border-border bg-surface p-5 shadow-lg outline-none`}
        data-neud-modal-size={size}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3">
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

        {children ? <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">{children}</div> : null}

        {footer ? <div className="mt-5 shrink-0">{footer}</div> : null}
      </div>
    </div>
  );
}
