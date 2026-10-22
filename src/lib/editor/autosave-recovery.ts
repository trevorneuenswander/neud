import type { EditableGraphicSchema } from "./editable-graphic-types";

const AUTOSAVE_PREFIX = "neud:graphic-editor:autosave:";

export type AutosaveSnapshot = {
  schema: EditableGraphicSchema;
  savedAt: string;
};

export function autosaveKey(projectId: string, displayId: string): string {
  return `${AUTOSAVE_PREFIX}${projectId}:${displayId}`;
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function writeAutosaveSnapshot(
  projectId: string,
  displayId: string,
  schema: EditableGraphicSchema,
): void {
  if (!canUseLocalStorage()) return;
  const payload: AutosaveSnapshot = {
    schema,
    savedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(autosaveKey(projectId, displayId), JSON.stringify(payload));
  } catch {
    // Quota or privacy mode — ignore.
  }
}

export function readAutosaveSnapshot(
  projectId: string,
  displayId: string,
): AutosaveSnapshot | null {
  if (!canUseLocalStorage()) return null;
  const raw = window.localStorage.getItem(autosaveKey(projectId, displayId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AutosaveSnapshot;
    if (!parsed?.schema || typeof parsed.savedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAutosaveSnapshot(projectId: string, displayId: string): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(autosaveKey(projectId, displayId));
  } catch {
    // ignore
  }
}

export type AutosaveWriter = {
  schedule: (schema: EditableGraphicSchema) => void;
  flush: () => void;
  cancel: () => void;
};

/**
 * Debounced autosave for client components (default 800ms).
 */
export function createAutosaveWriter(
  projectId: string,
  displayId: string,
  ms = 800,
): AutosaveWriter {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: EditableGraphicSchema | null = null;

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending) {
      writeAutosaveSnapshot(projectId, displayId, pending);
      pending = null;
    }
  }

  function cancel() {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  }

  function schedule(schema: EditableGraphicSchema) {
    pending = schema;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, ms);
  }

  return { schedule, flush, cancel };
}
