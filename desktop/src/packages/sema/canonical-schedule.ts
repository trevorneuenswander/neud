export type SemaScheduleRow = {
  stableRowId: string;
  rowIndex: number;
  date: string;
  time: string;
  title: string;
  description: string;
};

export type SemaScheduleState = {
  rows: SemaScheduleRow[];
  currentIndex: number;
  currentRowId: string | null;
  now: SemaScheduleRow | null;
  next: SemaScheduleRow | null;
  later: SemaScheduleRow | null;
  source: "google-sheets" | "manual";
  updatedAt: string;
};

export const SEMA_SHEET_COLUMNS = [
  "Date",
  "Time",
  "Title",
  "Event/Description",
] as const;

export function normalizeSemaCell(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

export function buildStableRowId(rowIndex: number, date: string, time: string, title: string): string {
  const basis = [rowIndex, date, time, title].join("|").toLowerCase();
  let hash = 0;
  for (let i = 0; i < basis.length; i += 1) {
    hash = (hash * 31 + basis.charCodeAt(i)) >>> 0;
  }
  return `sema-row-${rowIndex}-${hash.toString(16)}`;
}

export function parseSemaSheetRows(
  values: string[][],
  options?: { hasHeader?: boolean },
): { rows: SemaScheduleRow[]; error: string | null } {
  if (!Array.isArray(values) || values.length === 0) {
    return { rows: [], error: "Sheet is empty." };
  }

  const hasHeader = options?.hasHeader ?? true;
  let dataRows = values;
  if (hasHeader) {
    const header = values[0].map((cell) => normalizeSemaCell(cell).toLowerCase());
    const required = ["date", "time", "title", "event/description"];
    const missing = required.filter((name) => !header.includes(name));
    if (missing.length > 0) {
      // Accept Event or Description aliases for the fourth column.
      const fourthAliases = ["event/description", "event", "description", "event description"];
      const hasFourth = header.some((cell) => fourthAliases.includes(cell));
      const missingCore = ["date", "time", "title"].filter((name) => !header.includes(name));
      if (missingCore.length > 0 || !hasFourth) {
        return {
          rows: [],
          error: `Missing required columns: ${SEMA_SHEET_COLUMNS.join(", ")}`,
        };
      }
    }
    dataRows = values.slice(1);
  }

  const rows: SemaScheduleRow[] = [];
  dataRows.forEach((raw, index) => {
    const date = normalizeSemaCell(raw[0]);
    const time = normalizeSemaCell(raw[1]);
    const title = normalizeSemaCell(raw[2]);
    const description = normalizeSemaCell(raw[3]);
    if (!date && !time && !title && !description) {
      return;
    }
    const rowIndex = index + (hasHeader ? 2 : 1);
    rows.push({
      stableRowId: buildStableRowId(rowIndex, date, time, title),
      rowIndex,
      date,
      time,
      title,
      description,
    });
  });

  return { rows, error: null };
}

export function buildSemaScheduleState(input: {
  rows: SemaScheduleRow[];
  currentIndex?: number;
  currentRowId?: string | null;
  source: "google-sheets" | "manual";
  updatedAt?: string;
}): SemaScheduleState {
  let currentIndex = 0;
  const byId = input.currentRowId
    ? input.rows.findIndex((row) => row.stableRowId === input.currentRowId)
    : -1;
  if (byId >= 0) {
    currentIndex = byId;
  } else if (
    typeof input.currentIndex === "number" &&
    Number.isInteger(input.currentIndex) &&
    input.currentIndex >= 0
  ) {
    // Row id missing (edited/removed row): keep the operator's position instead of resetting to 0.
    currentIndex = Math.min(input.currentIndex, Math.max(input.rows.length - 1, 0));
  }

  if (input.rows.length === 0) {
    currentIndex = 0;
  } else if (currentIndex >= input.rows.length) {
    currentIndex = input.rows.length - 1;
  }

  const now = input.rows[currentIndex] ?? null;
  const next = input.rows[currentIndex + 1] ?? null;
  const later = input.rows[currentIndex + 2] ?? null;

  return {
    rows: input.rows,
    currentIndex,
    currentRowId: now?.stableRowId ?? null,
    now,
    next,
    later,
    source: input.source,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function advanceSemaSchedule(
  state: SemaScheduleState,
  direction: "next" | "previous",
): SemaScheduleState {
  if (state.rows.length === 0) {
    return state;
  }
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(state.rows.length - 1, state.currentIndex + delta));
  return buildSemaScheduleState({
    rows: state.rows,
    currentIndex: nextIndex,
    source: state.source,
  });
}

export function jumpSemaSchedule(state: SemaScheduleState, rowIdOrIndex: string | number): SemaScheduleState {
  if (typeof rowIdOrIndex === "number") {
    return buildSemaScheduleState({
      rows: state.rows,
      currentIndex: rowIdOrIndex,
      source: state.source,
    });
  }
  return buildSemaScheduleState({
    rows: state.rows,
    currentRowId: rowIdOrIndex,
    source: state.source,
  });
}

export function scheduleContentHash(rows: SemaScheduleRow[]): string {
  return rows
    .map((row) => [row.date, row.time, row.title, row.description].join("\t"))
    .join("\n");
}

function rowContentKey(row: SemaScheduleRow): string {
  return [row.date, row.time, row.title].join("\t").toLowerCase();
}

/**
 * Finds where the operator's current selection lives after the sheet changed.
 * Order of precedence:
 *  1. Same stable row id (description-only edit, nothing moved).
 *  2. Same date/time/title (rows inserted or removed above; closest to old position wins).
 *  3. Same position, clamped (the current row's own text was edited live).
 * Live edits therefore never reset the current index to the top of the sheet.
 */
export function reconcileSemaSelection(input: {
  previousRows: SemaScheduleRow[];
  previousIndex: number;
  nextRows: SemaScheduleRow[];
}): number {
  const { previousRows, previousIndex, nextRows } = input;
  if (nextRows.length === 0) {
    return 0;
  }
  const clamp = (index: number) => Math.max(0, Math.min(nextRows.length - 1, index));
  const previous = previousRows[previousIndex];
  if (!previous) {
    return clamp(previousIndex);
  }

  const sameId = nextRows.findIndex((row) => row.stableRowId === previous.stableRowId);
  if (sameId >= 0) {
    return sameId;
  }

  const key = rowContentKey(previous);
  let best = -1;
  nextRows.forEach((row, index) => {
    if (rowContentKey(row) !== key) return;
    if (best < 0 || Math.abs(index - previousIndex) < Math.abs(best - previousIndex)) {
      best = index;
    }
  });
  if (best >= 0) {
    return best;
  }

  return clamp(previousIndex);
}

export type SemaDisplayRowPayload = {
  date: string;
  time: string;
  title: string;
  description: string;
};

export type SemaDisplaySchedulePayload = {
  now: SemaDisplayRowPayload | null;
  next: SemaDisplayRowPayload | null;
  later: SemaDisplayRowPayload | null;
  /**
   * Label above the right-hand slot. Defaults to "LATER"; becomes the operator
   * Highlight label (e.g. "HIGHLIGHT") when a Highlight overlay is active.
   */
  laterLabel: string;
  /** True when the right-hand slot shows a Highlight overlay instead of schedule LATER. */
  highlightActive: boolean;
  /**
   * Changes only when the operator navigates (NEXT/PREV/Jump/NOW/source switch), never on a
   * live sheet edit. The Schedule Ticker animates a staged advance when this token changes and
   * swaps text in place when only row content changes.
   */
  currentRowId: string;
  currentIndex: number;
  rowCount: number;
  source: "google-sheets" | "manual";
  stale: boolean;
};

function toDisplayRow(row: SemaScheduleRow | null): SemaDisplayRowPayload | null {
  if (!row) return null;
  return {
    date: row.date,
    time: row.time,
    title: row.title,
    description: row.description,
  };
}

export function buildSemaDisplaySchedule(input: {
  state: SemaScheduleState;
  selectionToken: string;
  stale: boolean;
  laterLabel?: string;
  highlightActive?: boolean;
  highlightRow?: SemaDisplayRowPayload | null;
}): SemaDisplaySchedulePayload {
  const { state } = input;
  const highlightActive = input.highlightActive === true;
  return {
    now: toDisplayRow(state.now),
    next: toDisplayRow(state.next),
    later: highlightActive
      ? (input.highlightRow ?? { date: "", time: "", title: "", description: "" })
      : toDisplayRow(state.later),
    laterLabel: (input.laterLabel ?? (highlightActive ? "HIGHLIGHT" : "LATER")).trim() ||
      (highlightActive ? "HIGHLIGHT" : "LATER"),
    highlightActive,
    currentRowId: input.selectionToken,
    currentIndex: state.currentIndex,
    rowCount: state.rows.length,
    source: state.source,
    stale: input.stale,
  };
}
