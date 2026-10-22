import type { EditableGraphicSchema } from "./editable-graphic-types";
import { cloneSchema } from "./editable-graphic-types";

export type NamedEditorDraft = {
  id: string;
  name: string;
  savedAt: string;
  schema: EditableGraphicSchema;
};

function storageKey(projectId: string, displayId: string): string {
  return `neud-editor-drafts:${projectId}:${displayId}`;
}

export function listNamedDrafts(projectId: string, displayId: string): NamedEditorDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(projectId, displayId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NamedEditorDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(projectId: string, displayId: string, drafts: NamedEditorDraft[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(projectId, displayId), JSON.stringify(drafts));
}

export function saveNamedDraft(
  projectId: string,
  displayId: string,
  name: string,
  schema: EditableGraphicSchema,
  existingId?: string,
): NamedEditorDraft {
  const drafts = listNamedDrafts(projectId, displayId);
  const entry: NamedEditorDraft = {
    id: existingId ?? `draft-${Date.now().toString(36)}`,
    name: name.trim() || "Untitled Draft",
    savedAt: new Date().toISOString(),
    schema: cloneSchema(schema),
  };
  const without = drafts.filter((draft) => draft.id !== entry.id);
  persist(projectId, displayId, [entry, ...without]);
  return entry;
}

export function renameNamedDraft(
  projectId: string,
  displayId: string,
  draftId: string,
  name: string,
): NamedEditorDraft[] {
  const next = listNamedDrafts(projectId, displayId).map((draft) =>
    draft.id === draftId ? { ...draft, name: name.trim() || draft.name } : draft,
  );
  persist(projectId, displayId, next);
  return next;
}

export function duplicateNamedDraft(
  projectId: string,
  displayId: string,
  draftId: string,
): NamedEditorDraft[] {
  const hit = listNamedDrafts(projectId, displayId).find((draft) => draft.id === draftId);
  if (!hit) return listNamedDrafts(projectId, displayId);
  saveNamedDraft(projectId, displayId, `${hit.name} Copy`, hit.schema);
  return listNamedDrafts(projectId, displayId);
}

export function deleteNamedDraft(
  projectId: string,
  displayId: string,
  draftId: string,
): NamedEditorDraft[] {
  const next = listNamedDrafts(projectId, displayId).filter((draft) => draft.id !== draftId);
  persist(projectId, displayId, next);
  return next;
}
