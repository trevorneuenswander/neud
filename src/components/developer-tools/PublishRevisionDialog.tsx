"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";

type PublishRevisionDialogProps = {
  title: string;
  description: string;
  confirmLabel?: string;
  defaultRevisionName?: string;
  defaultChangeNote?: string;
  revisionNameLabel?: string;
  requireRevisionName?: boolean;
  hideChangeNote?: boolean;
  onCancel: () => void;
  onConfirm: (input: { revisionName: string; changeNote: string }) => void | Promise<void>;
};

export function PublishRevisionDialog({
  title,
  description,
  confirmLabel = "Publish",
  defaultRevisionName = "",
  defaultChangeNote = "",
  revisionNameLabel = "Version Name",
  requireRevisionName = false,
  hideChangeNote = false,
  onCancel,
  onConfirm,
}: PublishRevisionDialogProps) {
  const [revisionName, setRevisionName] = useState(defaultRevisionName);
  const [changeNote, setChangeNote] = useState(defaultChangeNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    const trimmedRevisionName = revisionName.trim();
    if (requireRevisionName && !trimmedRevisionName) {
      setError("Description is required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onConfirm({ revisionName: trimmedRevisionName, changeNote });
    } catch (confirmError) {
      setError(
        confirmError instanceof Error ? confirmError.message : "Unable to publish revision.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-revision-title"
        className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-lg"
      >
        <h3 id="publish-revision-title" className="text-lg font-semibold text-foreground">
          {title}
        </h3>
        <p className="mt-2 text-sm text-muted">{description}</p>

        <div className="mt-4 space-y-4">
          <FormField
            id="revision-name"
            name="revision-name"
            label={revisionNameLabel}
            value={revisionName}
            onChange={(event) => setRevisionName(event.target.value)}
            placeholder="Legacy ticker with live auction data"
            required={requireRevisionName}
          />
          {hideChangeNote ? null : (
            <div>
              <label htmlFor="change-note" className="text-sm font-medium text-foreground">
                Change Notes
              </label>
              <textarea
                id="change-note"
                name="change-note"
                rows={3}
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
                placeholder="Optional notes about this revision"
                className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </div>
          )}
        </div>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void handleConfirm()}>
            {busy ? "Publishing…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
