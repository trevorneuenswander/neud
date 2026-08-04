"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { NeudModal } from "@/components/ui/NeudModal";

type NeudPromptModalProps = {
  title: string;
  description?: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

export function NeudPromptModal({
  title,
  description,
  label,
  defaultValue = "",
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  onCancel,
  onConfirm,
}: NeudPromptModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("A value is required.");
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <NeudModal
      title={title}
      description={description}
      onClose={onCancel}
      initialFocusRef={inputRef}
      footer={
        <div className="space-y-4">
          <div>
            <label htmlFor="neud-prompt-input" className="mb-1 block text-sm font-medium text-foreground">
              {label}
            </label>
            <input
              ref={inputRef}
              id="neud-prompt-input"
              type="text"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleConfirm();
                }
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          {error ? <Alert variant="error">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button type="button" onClick={handleConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      }
    />
  );
}
