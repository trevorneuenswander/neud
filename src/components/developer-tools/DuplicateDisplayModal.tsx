"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { NeudModal } from "@/components/ui/NeudModal";

type DuplicateDisplayModalProps = {
  defaultName: string;
  defaultDescription?: string;
  onCancel: () => void;
  onConfirm: (values: { name: string; description?: string }) => Promise<void> | void;
};

export function DuplicateDisplayModal({
  defaultName,
  defaultDescription = "",
  onCancel,
  onConfirm,
}: DuplicateDisplayModalProps) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!name.trim()) {
      setError("Display name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm({
        name: name.trim(),
        description: description.trim() || undefined,
      });
    } catch (confirmError) {
      setError(
        confirmError instanceof Error ? confirmError.message : "Unable to duplicate display.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <NeudModal
      title="Duplicate Display"
      description="Choose a name and optional description for the duplicated display."
      onClose={onCancel}
      closeOnBackdrop={!busy}
      footer={
        <div className="space-y-4">
          <div>
            <label
              htmlFor="duplicate-display-name"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Display name
            </label>
            <input
              id="duplicate-display-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label
              htmlFor="duplicate-display-description"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Display description
            </label>
            <textarea
              id="duplicate-display-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void handleConfirm()}>
              {busy ? "Duplicating…" : "Duplicate"}
            </Button>
          </div>
        </div>
      }
    />
  );
}
