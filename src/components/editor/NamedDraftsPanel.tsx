"use client";

import { useState } from "react";
import type { NamedEditorDraft } from "@/lib/editor/named-drafts";

type NamedDraftsPanelProps = {
  drafts: NamedEditorDraft[];
  onSaveAsDraft: (name: string) => void;
  onOpen: (draftId: string) => void;
  onRename: (draftId: string, name: string) => void;
  onDuplicate: (draftId: string) => void;
  onDelete: (draftId: string) => void;
};

export function NamedDraftsPanel({
  drafts,
  onSaveAsDraft,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: NamedDraftsPanelProps) {
  const [draftName, setDraftName] = useState("Draft");

  return (
    <div className="space-y-2 p-2 text-xs">
      <p className="text-[10px] text-neutral-500">
        Named drafts are editor-only snapshots — separate from Published revisions.
      </p>
      <div className="flex gap-1">
        <input
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
        />
        <button
          type="button"
          className="rounded border border-neutral-700 px-2 py-0.5"
          onClick={() => onSaveAsDraft(draftName.trim() || "Draft")}
        >
          Save As Draft
        </button>
      </div>
      <ul className="max-h-[min(420px,50vh)] space-y-1 overflow-auto">
        {drafts.length === 0 ? (
          <li className="text-neutral-500">No named drafts yet.</li>
        ) : (
          drafts.map((draft) => (
            <li key={draft.id} className="rounded border border-neutral-800 p-2">
              <input
                className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-neutral-700"
                value={draft.name}
                onChange={(event) => onRename(draft.id, event.target.value)}
              />
              <div className="text-[10px] text-neutral-500">{draft.savedAt}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  className="rounded border border-neutral-700 px-1.5 py-0.5"
                  onClick={() => onOpen(draft.id)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="rounded border border-neutral-700 px-1.5 py-0.5"
                  onClick={() => onDuplicate(draft.id)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="rounded border border-red-900 px-1.5 py-0.5 text-red-300"
                  onClick={() => onDelete(draft.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
