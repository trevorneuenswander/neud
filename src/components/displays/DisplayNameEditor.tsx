"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { localRenameDeveloperDisplay } from "@/lib/local/developer-tools-api";

type DisplayNameEditorProps = {
  projectSlug: string;
  displayId: string;
  initialName: string;
  canRename: boolean;
  onRenamed?: (name: string) => void;
};

export function DisplayNameEditor({
  projectSlug,
  displayId,
  initialName,
  canRename,
  onRenamed,
}: DisplayNameEditorProps) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canRename) {
    return <span className="text-sm font-semibold text-foreground">{name}</span>;
  }

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Display name is required.");
      return;
    }
    if (trimmed.length > 120) {
      setError("Display name is too long.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await localRenameDeveloperDisplay(projectSlug, displayId, trimmed);
      setName(result.display.name);
      setEditing(false);
      onRenamed?.(result.display.name);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to rename display.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={draft}
            maxLength={120}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            className="min-w-[12rem] rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-foreground"
            aria-label="Display name"
          />
          <Button type="button" size="sm" disabled={busy} onClick={() => void handleSave()}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setDraft(name);
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
        <p className="text-xs text-muted">
          Renaming the display does not change its local URL.
        </p>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-foreground">{name}</span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Rename ${name}`}
        onClick={() => {
          setDraft(name);
          setEditing(true);
          setError(null);
        }}
      >
        ✎
      </Button>
    </div>
  );
}
