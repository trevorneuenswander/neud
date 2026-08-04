"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { NeudModal } from "@/components/ui/NeudModal";

type NeudAlertModalProps = {
  title: string;
  description: string;
  confirmLabel?: string;
  onClose: () => void;
  variant?: "info" | "error" | "warning" | "success";
};

function modalIcon(variant: NeudAlertModalProps["variant"]) {
  const tone =
    variant === "error"
      ? "border-danger/30 bg-danger/10 text-danger"
      : variant === "warning"
        ? "border-warning/30 bg-warning/10 text-warning"
        : variant === "success"
          ? "border-success/30 bg-success/10 text-success"
          : "border-primary/30 bg-primary/10 text-primary";

  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-full border ${tone}`}
    >
      {variant === "error" ? "!" : variant === "warning" ? "!" : "i"}
    </div>
  );
}

export function NeudAlertModal({
  title,
  description,
  confirmLabel = "OK",
  onClose,
  variant = "info",
}: NeudAlertModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <NeudModal
      title={title}
      description={description}
      onClose={onClose}
      icon={modalIcon(variant)}
      initialFocusRef={confirmRef}
      footer={
        <div className="flex justify-end">
          <Button ref={confirmRef} type="button" onClick={onClose}>
            {confirmLabel}
          </Button>
        </div>
      }
    />
  );
}
