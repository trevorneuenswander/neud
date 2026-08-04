"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { OverlayCloseButton } from "@/components/ui/OverlayCloseButton";

type PermanentDeleteDisplayDialogProps = {
  displayName: string;
  archived?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
};

export function PermanentDeleteDisplayDialog({
  displayName,
  archived = false,
  onCancel,
  onConfirm,
}: PermanentDeleteDisplayDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredText = "DELETE";
  const canConfirm =
    confirmation === requiredText || confirmation.trim() === displayName.trim();

  const handleCancel = useCallback(() => {
    if (busy) return;
    onCancel();
  }, [busy, onCancel]);

  useEffect(() => {
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleCancel]);

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Unable to delete display.",
      );
    } finally {
      setBusy(false);
    }
  }

  const description = archived
    ? `This will delete the archived display, its HTML revisions, local display URL, saved display settings, and display-order preferences. Activity history will be retained. This action cannot be undone.`
    : `This will delete the display, its HTML revisions, local display URL, saved display settings, and display-order preferences. Activity history will be retained. This action cannot be undone.`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-lg outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              aria-hidden="true"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-danger/30 bg-danger/10 text-danger"
            >
              !
            </div>
            <div className="min-w-0 flex-1">
              <h3 id={titleId} className="text-lg font-semibold text-foreground">
                Permanently delete &ldquo;{displayName}&rdquo;?
              </h3>
              <p id={descriptionId} className="mt-2 text-sm text-muted">
                {description}
              </p>
            </div>
          </div>
          <OverlayCloseButton onClick={handleCancel} disabled={busy} />
        </div>

        <div className="mt-4">
          <FormField
            id="delete-display-confirmation"
            name="deleteConfirmation"
            label={`Type ${requiredText} or the display name to confirm`}
            value={confirmation}
            disabled={busy}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>

        {error ? (
          <div className="mt-4">
            <Alert variant="error">{error}</Alert>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !canConfirm}
            onClick={() => void handleConfirm()}
          >
            {busy ? "Deleting…" : "Delete Permanently"}
          </Button>
        </div>
      </div>
    </div>
  );
}
