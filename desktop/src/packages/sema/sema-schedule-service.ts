import crypto from "crypto";
import type { LocalDatabase } from "../../database/connection";
import {
  advanceSemaSchedule,
  buildSemaDisplaySchedule,
  buildSemaScheduleState,
  jumpSemaSchedule,
  normalizeSemaCell,
  reconcileSemaSelection,
  type SemaDisplaySchedulePayload,
  type SemaScheduleRow,
  type SemaScheduleState,
} from "./canonical-schedule";
import {
  clampSheetsPollInterval,
  extractSpreadsheetId,
  extractWorksheetGidFromUrl,
  fetchSemaSheetSchedule,
  listPublicSpreadsheetWorksheets,
  type GoogleSheetsAdapterConfig,
  type SpreadsheetWorksheet,
} from "./google-sheets-adapter";

/**
 * SEMA local schedule service.
 *
 * Source precedence (highest first):
 *  1. `manual` source mode: the operator's manual backup fields are the only output.
 *     Sheet polling keeps the cache fresh in the background but never touches the display.
 *  2. `google-sheets` source mode: the live sheet when reachable, otherwise the last-known
 *     cached rows (offline). The operator's position is kept either way.
 *  There is deliberately no automatic fallback from the sheet to manual fields; switching
 *  what is on air is always an explicit operator action.
 *
 * Credential boundary: v1 reads published/readable sheets over public CSV export, so there are
 * no secrets to store. Private Google Sheets API/OAuth access is deferred; when added, tokens
 * must live in the OS credential store in the main process, never in this table, the project
 * package, the renderer, or any display payload.
 */

export const MANUAL_ROW_ID = "manual-now";
export const MANUAL_NEXT_ROW_ID = "manual-next";
export const MANUAL_LATER_ROW_ID = "manual-later";
const MAX_MANUAL_FIELD_LENGTH = 500;

type SemaStateRow = {
  project_id: string;
  source_mode: string;
  current_index: number;
  current_row_id: string | null;
  rows_json: string;
  content_hash: string | null;
  sheet_spreadsheet_id: string | null;
  sheet_worksheet_gid: string | null;
  sheet_worksheet_title: string | null;
  sheet_access_mode: string;
  poll_interval_ms: number;
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  viewing_worksheet_gid: string | null;
  viewing_worksheet_title: string | null;
  viewing_rows_json: string | null;
  viewing_content_hash: string | null;
  viewing_current_index: number | null;
  viewing_current_row_id: string | null;
  viewing_last_success_at: string | null;
  viewing_last_error: string | null;
  manual_date: string | null;
  manual_time: string | null;
  manual_title: string | null;
  manual_description: string | null;
  manual_next_title: string | null;
  manual_next_description: string | null;
  manual_later_title: string | null;
  manual_later_description: string | null;
  highlight_active: number | null;
  highlight_source: string | null;
  highlight_label: string | null;
  highlight_title: string | null;
  highlight_description: string | null;
  highlight_source_row_id: string | null;
  highlight_source_worksheet_gid: string | null;
  selection_seq: number;
  state_revision: number;
  updated_at: string;
};

export type SemaManualFields = {
  date: string;
  time: string;
  title: string;
  description: string;
  nextTitle: string;
  nextDescription: string;
  laterTitle: string;
  laterDescription: string;
};

export type SemaHighlightSource = "scheduled" | "custom";

export type SemaHighlightState = {
  active: boolean;
  source: SemaHighlightSource | null;
  label: string;
  title: string;
  description: string;
  /** Stable schedule row id when source is "scheduled"; null for custom text. */
  sourceRowId: string | null;
  /** Live worksheet gid the scheduled Highlight row belongs to (null for custom). */
  sourceWorksheetGid: string | null;
};

export const DEFAULT_HIGHLIGHT_LABEL = "HIGHLIGHT";

export type SemaPersistedState = {
  projectId: string;
  sourceMode: "google-sheets" | "manual";
  /** Effective on-air schedule: manual slots in manual mode, otherwise the live sheet cache. */
  schedule: SemaScheduleState;
  /**
   * Viewing worksheet cache for the Data Source table (may differ from live).
   * Changing this does not publish to graphics.
   */
  sheetSchedule: SemaScheduleState;
  /** Live worksheet cache that drives NOW/NEXT/LATER when Google Sheets is on air. */
  liveSchedule: SemaScheduleState;
  sheet: GoogleSheetsAdapterConfig;
  /** Worksheet currently shown in the Data Source table (viewing-only). */
  viewing: {
    worksheetGid: string | null;
    worksheetTitle: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
  };
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  manual: SemaManualFields;
  /** Operator Highlight overlay; replaces on-air LATER without mutating schedule rows. */
  highlight: SemaHighlightState;
  /** Rows held in the last-known live sheet cache (independent of the active source mode). */
  cacheRowCount: number;
  /** True when the sheet is the active source but the latest fetch failed (cache is on air). */
  stale: boolean;
  selectionToken: string;
  revision: number;
  updatedAt: string;
};

export type SemaDisplayPayload = {
  schedule: SemaDisplaySchedulePayload;
  source: "google-sheets" | "manual";
  stale: boolean;
  revision: number;
  contentHash: string;
  updatedAt: string;
};

export type SemaChangeReason =
  | "navigation"
  | "now"
  | "source"
  | "manual"
  | "highlight"
  | "sheet"
  | "config";

function emptyHighlight(): SemaHighlightState {
  return {
    active: false,
    source: null,
    label: DEFAULT_HIGHLIGHT_LABEL,
    title: "",
    description: "",
    sourceRowId: null,
    sourceWorksheetGid: null,
  };
}

function readHighlight(row: SemaStateRow): SemaHighlightState {
  const source =
    row.highlight_source === "scheduled" || row.highlight_source === "custom"
      ? row.highlight_source
      : null;
  const label =
    sanitizeManualField(row.highlight_label ?? DEFAULT_HIGHLIGHT_LABEL) ||
    DEFAULT_HIGHLIGHT_LABEL;
  return {
    active: Number(row.highlight_active ?? 0) === 1,
    source,
    label: label.toUpperCase(),
    title: row.highlight_title ?? "",
    description: row.highlight_description ?? "",
    sourceRowId: row.highlight_source_row_id?.trim() || null,
    sourceWorksheetGid: row.highlight_source_worksheet_gid?.trim() || null,
  };
}

function sameWorksheetGid(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return (left ?? null) === (right ?? null);
}

export type SemaChangeEvent = {
  projectId: string;
  reason: SemaChangeReason;
  revision: number;
  contentHash: string;
};

export type SemaRefreshResult = {
  state: SemaPersistedState;
  /** True when nothing about the cached schedule changed (same content hash, or fetch failed). */
  unchanged: boolean;
  /** True when this refresh changed what the display shows. */
  published: boolean;
  offline: boolean;
};

export type SemaScheduleServiceOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

const DEFAULT_SHEET_CONFIG: GoogleSheetsAdapterConfig = {
  spreadsheetId: "",
  accessMode: "public-csv",
  pollIntervalMs: 15_000,
};

function parseRows(raw: string): SemaScheduleRow[] {
  try {
    const parsed = JSON.parse(raw) as SemaScheduleRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sanitizeManualField(value: string): string {
  const normalized = normalizeSemaCell(value);
  return normalized.length > MAX_MANUAL_FIELD_LENGTH
    ? normalized.slice(0, MAX_MANUAL_FIELD_LENGTH)
    : normalized;
}

function describeFetchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Google Sheet unreachable (${message}). Using last-known schedule.`;
}

export class SemaScheduleService {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly listeners = new Set<(event: SemaChangeEvent) => void>();
  private readonly pollTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pollingProjects = new Set<string>();
  private readonly inFlight = new Map<string, Promise<SemaRefreshResult>>();

  constructor(
    private readonly db: LocalDatabase,
    options: SemaScheduleServiceOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date());
  }

  onChange(listener: (event: SemaChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  private readRow(projectId: string): SemaStateRow | undefined {
    return this.db
      .prepare(`SELECT * FROM sema_schedule_state WHERE project_id = ?`)
      .get(projectId) as SemaStateRow | undefined;
  }

  getState(projectId: string): SemaPersistedState {
    const row = this.readRow(projectId);
    if (!row) {
      const manual: SemaManualFields = {
        date: "",
        time: "",
        title: "",
        description: "",
        nextTitle: "",
        nextDescription: "",
        laterTitle: "",
        laterDescription: "",
      };
      const emptySchedule = buildSemaScheduleState({
        rows: [],
        currentIndex: 0,
        source: "google-sheets",
        updatedAt: this.now().toISOString(),
      });
      return {
        projectId,
        sourceMode: "google-sheets",
        schedule: emptySchedule,
        sheetSchedule: emptySchedule,
        liveSchedule: emptySchedule,
        sheet: { ...DEFAULT_SHEET_CONFIG },
        viewing: {
          worksheetGid: null,
          worksheetTitle: null,
          lastSuccessAt: null,
          lastError: null,
        },
        lastSuccessAt: null,
        lastAttemptAt: null,
        lastError: null,
        manual,
        highlight: emptyHighlight(),
        cacheRowCount: 0,
        stale: false,
        selectionToken: "sel-0",
        revision: 0,
        updatedAt: this.now().toISOString(),
      };
    }

    const sourceMode = row.source_mode === "manual" ? "manual" : "google-sheets";
    const liveRows = parseRows(row.rows_json);
    const liveGid = row.sheet_worksheet_gid ?? null;
    const viewingGid = row.viewing_worksheet_gid ?? liveGid;
    const viewingSharesLive = sameWorksheetGid(viewingGid, liveGid);
    const viewingRows = viewingSharesLive
      ? liveRows
      : parseRows(row.viewing_rows_json ?? "[]");
    const viewingIndex = viewingSharesLive
      ? row.current_index
      : row.viewing_current_index ?? 0;
    const viewingRowId = viewingSharesLive
      ? row.current_row_id
      : row.viewing_current_row_id;
    const manual: SemaManualFields = {
      date: row.manual_date ?? "",
      time: row.manual_time ?? "",
      title: row.manual_title ?? "",
      description: row.manual_description ?? "",
      nextTitle: row.manual_next_title ?? "",
      nextDescription: row.manual_next_description ?? "",
      laterTitle: row.manual_later_title ?? "",
      laterDescription: row.manual_later_description ?? "",
    };

    const liveSchedule = buildSemaScheduleState({
      rows: liveRows,
      currentIndex: row.current_index,
      currentRowId: row.current_row_id,
      source: "google-sheets",
      updatedAt: row.updated_at,
    });

    const sheetSchedule = buildSemaScheduleState({
      rows: viewingRows,
      currentIndex: viewingIndex,
      currentRowId: viewingRowId,
      source: "google-sheets",
      updatedAt: row.updated_at,
    });

    const schedule =
      sourceMode === "manual"
        ? buildSemaScheduleState({
            rows: this.toManualRows(manual),
            currentIndex: 0,
            source: "manual",
            updatedAt: row.updated_at,
          })
        : liveSchedule;

    return {
      projectId,
      sourceMode,
      schedule,
      sheetSchedule,
      liveSchedule,
      sheet: {
        spreadsheetId: row.sheet_spreadsheet_id ?? "",
        worksheetGid: liveGid,
        worksheetTitle: row.sheet_worksheet_title,
        accessMode: row.sheet_access_mode === "api" ? "api" : "public-csv",
        pollIntervalMs: clampSheetsPollInterval(row.poll_interval_ms),
      },
      viewing: {
        worksheetGid: viewingGid,
        worksheetTitle: viewingSharesLive
          ? row.sheet_worksheet_title
          : row.viewing_worksheet_title,
        lastSuccessAt: viewingSharesLive
          ? row.last_success_at
          : row.viewing_last_success_at,
        lastError: viewingSharesLive ? row.last_error : row.viewing_last_error,
      },
      lastSuccessAt: row.last_success_at,
      lastAttemptAt: row.last_attempt_at,
      lastError: row.last_error,
      manual,
      highlight: readHighlight(row),
      cacheRowCount: liveRows.length,
      stale:
        sourceMode === "google-sheets" && Boolean(row.last_error) && liveRows.length > 0,
      selectionToken: `sel-${row.selection_seq}`,
      revision: row.state_revision,
      updatedAt: row.updated_at,
    };
  }

  /** Minimal payload the Schedule Ticker needs (no full sheet, no config, no credentials). */
  toDisplayPayload(projectId: string): SemaDisplayPayload {
    const state = this.getState(projectId);
    const highlight = state.highlight;
    const schedule = buildSemaDisplaySchedule({
      state: state.schedule,
      selectionToken: state.selectionToken,
      stale: state.stale,
      // Audience-facing heading stays LATER; Highlight only replaces title/description.
      highlightActive: highlight.active,
      laterLabel: "LATER",
      highlightRow: highlight.active
        ? {
            date: "",
            time: "",
            title: highlight.title,
            description: highlight.description,
          }
        : null,
    });
    const contentHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ schedule, source: state.sourceMode }))
      .digest("hex");
    return {
      schedule,
      source: state.sourceMode,
      stale: state.stale,
      revision: state.revision,
      contentHash,
      updatedAt: state.updatedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  private ensureRow(projectId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO sema_schedule_state (project_id, updated_at) VALUES (?, ?)`,
      )
      .run(projectId, this.now().toISOString());
  }

  private patch(
    projectId: string,
    fields: Record<string, string | number | null>,
    options: { touchUpdatedAt: boolean } = { touchUpdatedAt: true },
  ): void {
    this.ensureRow(projectId);
    const entries = Object.entries(fields);
    if (options.touchUpdatedAt) {
      entries.push(["updated_at", this.now().toISOString()]);
    }
    if (entries.length === 0) return;
    const assignments = entries.map(([column]) => `${column} = ?`).join(", ");
    this.db
      .prepare(`UPDATE sema_schedule_state SET ${assignments} WHERE project_id = ?`)
      .run(...entries.map(([, value]) => value), projectId);
  }

  private toManualRows(manual: SemaManualFields): SemaScheduleRow[] {
    return [
      {
        stableRowId: MANUAL_ROW_ID,
        rowIndex: 1,
        date: manual.date,
        time: manual.time,
        title: manual.title,
        description: manual.description,
      },
      {
        stableRowId: MANUAL_NEXT_ROW_ID,
        rowIndex: 2,
        date: "",
        time: "",
        title: manual.nextTitle,
        description: manual.nextDescription,
      },
      {
        stableRowId: MANUAL_LATER_ROW_ID,
        rowIndex: 3,
        date: "",
        time: "",
        title: manual.laterTitle,
        description: manual.laterDescription,
      },
    ];
  }

  /** Bumps the output revision and tells subscribers (display SSE) something on air changed. */
  private publish(
    projectId: string,
    reason: SemaChangeReason,
    options: { newSelection: boolean },
  ): void {
    const row = this.readRow(projectId);
    const patch: Record<string, number> = {
      state_revision: (row?.state_revision ?? 0) + 1,
    };
    if (options.newSelection) {
      patch.selection_seq = (row?.selection_seq ?? 0) + 1;
    }
    this.patch(projectId, patch);
    const payload = this.toDisplayPayload(projectId);
    const event: SemaChangeEvent = {
      projectId,
      reason,
      revision: payload.revision,
      contentHash: payload.contentHash,
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn("[sema] change listener failed", error);
      }
    }
  }

  async listWorksheets(projectId: string, spreadsheetUrlOrId?: string): Promise<{
    worksheets: SpreadsheetWorksheet[];
    selectedGid: string | null;
    selectedTitle: string | null;
    error: string | null;
  }> {
    const current = this.getState(projectId);
    const source =
      spreadsheetUrlOrId?.trim() ||
      current.sheet.spreadsheetId ||
      "";
    const spreadsheetId = extractSpreadsheetId(source);
    if (!spreadsheetId) {
      return {
        worksheets: [],
        selectedGid: current.sheet.worksheetGid ?? null,
        selectedTitle: current.sheet.worksheetTitle ?? null,
        error: "Configure a Google Sheets URL before listing tabs.",
      };
    }
    const listed = await listPublicSpreadsheetWorksheets(spreadsheetId, this.fetchImpl);
    return {
      worksheets: listed.worksheets,
      selectedGid: current.viewing.worksheetGid ?? current.sheet.worksheetGid ?? null,
      selectedTitle: current.viewing.worksheetTitle ?? current.sheet.worksheetTitle ?? null,
      error: listed.error,
    };
  }

  /**
   * Configure spreadsheet URL / poll interval / initial live worksheet.
   * Does not use the Data Source tab dropdown — that calls setViewingWorksheet.
   * When a worksheet gid is provided (URL #gid= or explicit), both live and viewing
   * are aligned so first-time setup still works.
   */
  configureSheet(
    projectId: string,
    input: {
      spreadsheetUrlOrId: string;
      worksheetGid?: string | null;
      worksheetTitle?: string | null;
      pollIntervalMs?: number;
    },
  ): SemaPersistedState {
    const spreadsheetId = extractSpreadsheetId(input.spreadsheetUrlOrId ?? "");
    if (!spreadsheetId) {
      throw new Error("Enter a Google Sheets URL or spreadsheet ID.");
    }
    const gidFromUrl = extractWorksheetGidFromUrl(input.spreadsheetUrlOrId ?? "");
    const worksheetGid =
      input.worksheetGid === undefined
        ? gidFromUrl ?? undefined
        : input.worksheetGid === null || input.worksheetGid.trim() === ""
          ? null
          : input.worksheetGid.trim();
    if (worksheetGid && !/^\d{1,20}$/.test(worksheetGid)) {
      throw new Error("Worksheet gid must be a number (see the #gid= value in the sheet URL).");
    }

    const current = this.getState(projectId);
    const nextGid = worksheetGid === undefined ? (current.sheet.worksheetGid ?? null) : worksheetGid;
    const nextTitle =
      input.worksheetTitle === undefined
        ? current.sheet.worksheetTitle ?? null
        : input.worksheetTitle === null || input.worksheetTitle.trim() === ""
          ? null
          : input.worksheetTitle.trim();
    const spreadsheetChanged = current.sheet.spreadsheetId !== spreadsheetId;
    const worksheetChanged = (current.sheet.worksheetGid ?? null) !== nextGid;

    const fields: Record<string, string | number | null> = {
      sheet_spreadsheet_id: spreadsheetId,
      sheet_worksheet_gid: nextGid,
      sheet_worksheet_title: nextTitle,
      viewing_worksheet_gid: nextGid,
      viewing_worksheet_title: nextTitle,
      sheet_access_mode: "public-csv",
      poll_interval_ms: clampSheetsPollInterval(
        input.pollIntervalMs ?? current.sheet.pollIntervalMs,
      ),
    };
    if (spreadsheetChanged) {
      // A different spreadsheet invalidates the old cache and position.
      fields.rows_json = "[]";
      fields.current_index = 0;
      fields.current_row_id = null;
      fields.content_hash = null;
      fields.last_success_at = null;
      fields.last_error = null;
      fields.viewing_rows_json = "[]";
      fields.viewing_current_index = 0;
      fields.viewing_current_row_id = null;
      fields.viewing_content_hash = null;
      fields.viewing_last_success_at = null;
      fields.viewing_last_error = null;
    } else if (worksheetChanged) {
      // Keep the previous live cache until the new live tab refreshes successfully.
      fields.content_hash = null;
      fields.last_error = null;
      fields.viewing_content_hash = null;
      fields.viewing_last_error = null;
    }
    this.patch(projectId, fields);

    if (spreadsheetChanged && current.sourceMode === "google-sheets") {
      this.publish(projectId, "config", { newSelection: true });
    }
    if (this.pollingProjects.has(projectId)) {
      this.startPolling(projectId);
    }
    return this.getState(projectId);
  }

  /**
   * Change the Data Source viewing worksheet only. Never publishes to graphics /
   * never mutates live NOW/NEXT/LATER / never clears Highlight.
   */
  async setViewingWorksheet(
    projectId: string,
    input: { worksheetGid: string; worksheetTitle?: string | null },
  ): Promise<SemaPersistedState> {
    const gid = input.worksheetGid.trim();
    if (!/^\d{1,20}$/.test(gid)) {
      throw new Error("Worksheet gid must be a number (see the #gid= value in the sheet URL).");
    }
    const current = this.getState(projectId);
    if (!current.sheet.spreadsheetId) {
      throw new Error("Configure a Google Sheets URL before selecting a tab.");
    }
    const title =
      input.worksheetTitle === undefined
        ? null
        : input.worksheetTitle === null || input.worksheetTitle.trim() === ""
          ? null
          : input.worksheetTitle.trim();

    if (sameWorksheetGid(gid, current.sheet.worksheetGid)) {
      // Align viewing with live without fetching or publishing.
      this.patch(projectId, {
        viewing_worksheet_gid: current.sheet.worksheetGid ?? null,
        viewing_worksheet_title: title ?? current.sheet.worksheetTitle ?? null,
        viewing_rows_json: JSON.stringify(current.liveSchedule.rows),
        viewing_current_index: current.liveSchedule.currentIndex,
        viewing_current_row_id: current.liveSchedule.currentRowId,
        viewing_content_hash: null,
        viewing_last_success_at: current.lastSuccessAt,
        viewing_last_error: null,
      });
      return this.getState(projectId);
    }

    this.patch(projectId, {
      viewing_worksheet_gid: gid,
      viewing_worksheet_title: title,
      viewing_last_error: null,
    });

    try {
      const result = await fetchSemaSheetSchedule(
        {
          spreadsheetId: current.sheet.spreadsheetId,
          worksheetGid: gid,
          worksheetTitle: title,
          accessMode: "public-csv",
          pollIntervalMs: current.sheet.pollIntervalMs,
        },
        null,
        this.fetchImpl,
      );
      if (result.error) {
        this.patch(projectId, {
          viewing_last_error: result.error,
          viewing_last_success_at: null,
        });
        return this.getState(projectId);
      }
      this.patch(projectId, {
        viewing_rows_json: JSON.stringify(result.rows),
        viewing_content_hash: result.contentHash,
        viewing_current_index: 0,
        viewing_current_row_id: result.rows[0]?.stableRowId ?? null,
        viewing_last_success_at: result.fetchedAt,
        viewing_last_error: null,
        viewing_worksheet_title: title,
      });
    } catch (error) {
      this.patch(projectId, {
        viewing_last_error: describeFetchError(error),
      });
    }
    return this.getState(projectId);
  }

  setSourceMode(projectId: string, mode: "google-sheets" | "manual"): SemaPersistedState {
    const current = this.getState(projectId);
    if (current.sourceMode === mode) {
      return current;
    }
    this.patch(projectId, { source_mode: mode });
    this.publish(projectId, "source", { newSelection: true });
    return this.getState(projectId);
  }

  /**
   * Activate or update the Highlight overlay that replaces on-air LATER.
   * Does not mutate sheet cache rows or Manual Controller Later fields.
   */
  setHighlight(
    projectId: string,
    input: {
      source: SemaHighlightSource;
      label?: string;
      title: string;
      description?: string;
      sourceRowId?: string | null;
    },
  ): SemaPersistedState {
    const title = sanitizeManualField(input.title);
    if (!title) {
      throw new Error("Highlight title is required.");
    }
    const description = sanitizeManualField(input.description ?? "");
    const current = this.getState(projectId);
    const label =
      sanitizeManualField(
        input.label ?? current.highlight.label ?? DEFAULT_HIGHLIGHT_LABEL,
      ).toUpperCase() || DEFAULT_HIGHLIGHT_LABEL;
    if (label.length > 40) {
      throw new Error("Highlight label must be 40 characters or fewer.");
    }
    const sourceRowId =
      input.source === "scheduled"
        ? sanitizeManualField(input.sourceRowId ?? "").trim() || null
        : null;
    const sourceWorksheetGid =
      input.source === "scheduled"
        ? current.viewing.worksheetGid ?? current.sheet.worksheetGid ?? null
        : null;
    if (input.source === "scheduled" && !sourceRowId) {
      throw new Error("Select a scheduled event for the Highlight.");
    }
    if (input.source === "scheduled" && sourceRowId) {
      // Only treat NOW/NEXT as conflicts when the viewed worksheet is the live one.
      if (sameWorksheetGid(sourceWorksheetGid, current.sheet.worksheetGid)) {
        const live = current.liveSchedule;
        if (live.next?.stableRowId === sourceRowId) {
          throw new Error(
            "That event is already NEXT. Choose a later schedule event for Highlight.",
          );
        }
        if (live.now?.stableRowId === sourceRowId) {
          throw new Error(
            "That event is already NOW. Choose a later schedule event for Highlight.",
          );
        }
      }
    }

    this.patch(projectId, {
      highlight_active: 1,
      highlight_source: input.source,
      highlight_label: label,
      highlight_title: title,
      highlight_description: description,
      highlight_source_row_id: sourceRowId,
      highlight_source_worksheet_gid: sourceWorksheetGid,
    });
    this.publish(projectId, "highlight", { newSelection: false });
    return this.getState(projectId);
  }

  /**
   * Deactivate Highlight on air but keep prepared fields so the operator can
   * reactivate without re-entering label/title/description/source.
   */
  removeHighlight(projectId: string): SemaPersistedState {
    const current = this.getState(projectId);
    if (!current.highlight.active) {
      return current;
    }
    this.patch(projectId, {
      highlight_active: 0,
    });
    this.publish(projectId, "highlight", { newSelection: false });
    return this.getState(projectId);
  }

  /**
   * Quietly deactivate a scheduled Highlight when its source row becomes NEXT or NOW.
   * Preserves prepared fields; does not emit operator activity (caller publishes once).
   * @returns true when Highlight was deactivated.
   */
  private autoRemoveScheduledHighlightIfDue(projectId: string): boolean {
    const current = this.getState(projectId);
    const highlight = current.highlight;
    if (!highlight.active || highlight.source !== "scheduled" || !highlight.sourceRowId) {
      return false;
    }
    // Compare within the live worksheet only — never remove because another tab
    // happens to reuse a stable row id.
    if (
      highlight.sourceWorksheetGid &&
      !sameWorksheetGid(highlight.sourceWorksheetGid, current.sheet.worksheetGid)
    ) {
      return false;
    }
    const live = current.liveSchedule;
    const due =
      live.next?.stableRowId === highlight.sourceRowId ||
      live.now?.stableRowId === highlight.sourceRowId;
    if (!due) {
      return false;
    }
    this.patch(projectId, {
      highlight_active: 0,
    });
    return true;
  }

  /**
   * Deactivate Highlight and wipe prepared fields (label reset, source cleared).
   * Distinct from removeHighlight, which preserves the prepared overlay.
   */
  clearHighlight(projectId: string): SemaPersistedState {
    const current = this.getState(projectId);
    const alreadyClear =
      !current.highlight.active &&
      !current.highlight.title &&
      !current.highlight.description &&
      !current.highlight.sourceRowId &&
      !current.highlight.sourceWorksheetGid &&
      current.highlight.source == null &&
      (current.highlight.label === DEFAULT_HIGHLIGHT_LABEL || !current.highlight.label);
    if (alreadyClear) {
      return current;
    }
    this.patch(projectId, {
      highlight_active: 0,
      highlight_source: null,
      highlight_label: DEFAULT_HIGHLIGHT_LABEL,
      highlight_title: "",
      highlight_description: "",
      highlight_source_row_id: null,
      highlight_source_worksheet_gid: null,
    });
    this.publish(projectId, "highlight", { newSelection: false });
    return this.getState(projectId);
  }

  setManualFields(
    projectId: string,
    fields: Partial<SemaManualFields>,
    options: { takeOnAir?: boolean } = {},
  ): SemaPersistedState {
    const current = this.getState(projectId);
    const manual: SemaManualFields = {
      date: sanitizeManualField(fields.date ?? current.manual.date),
      time: sanitizeManualField(fields.time ?? current.manual.time),
      title: sanitizeManualField(fields.title ?? current.manual.title),
      description: sanitizeManualField(fields.description ?? current.manual.description),
      nextTitle: sanitizeManualField(fields.nextTitle ?? current.manual.nextTitle),
      nextDescription: sanitizeManualField(
        fields.nextDescription ?? current.manual.nextDescription,
      ),
      laterTitle: sanitizeManualField(fields.laterTitle ?? current.manual.laterTitle),
      laterDescription: sanitizeManualField(
        fields.laterDescription ?? current.manual.laterDescription,
      ),
    };
    const unchanged =
      manual.date === current.manual.date &&
      manual.time === current.manual.time &&
      manual.title === current.manual.title &&
      manual.description === current.manual.description &&
      manual.nextTitle === current.manual.nextTitle &&
      manual.nextDescription === current.manual.nextDescription &&
      manual.laterTitle === current.manual.laterTitle &&
      manual.laterDescription === current.manual.laterDescription;
    const switchingOnAir = options.takeOnAir === true && current.sourceMode !== "manual";
    if (unchanged && !switchingOnAir) {
      return current;
    }
    this.patch(projectId, {
      manual_date: manual.date,
      manual_time: manual.time,
      manual_title: manual.title,
      manual_description: manual.description,
      manual_next_title: manual.nextTitle,
      manual_next_description: manual.nextDescription,
      manual_later_title: manual.laterTitle,
      manual_later_description: manual.laterDescription,
      ...(switchingOnAir ? { source_mode: "manual" } : {}),
    });
    if (switchingOnAir) {
      this.publish(projectId, "source", { newSelection: true });
    } else if (current.sourceMode === "manual") {
      // Content edit while on air: swap in place, no staged advance.
      this.publish(projectId, "manual", { newSelection: false });
    }
    return this.getState(projectId);
  }

  /**
   * NEXT / PREV. Always moves the Google Sheets cache cursor (works offline from last-known
   * cache). Never changes sourceMode — when Manual Controller is on air, only the sheet cache
   * moves; on-air displays keep showing manual values until the operator toggles source.
   */
  advance(projectId: string, direction: "next" | "previous"): SemaPersistedState {
    const current = this.getState(projectId);
    const viewingIsLive = sameWorksheetGid(
      current.viewing.worksheetGid,
      current.sheet.worksheetGid,
    );

    if (!viewingIsLive) {
      // Browse-only: move the viewing cursor without touching live graphics.
      const nextViewing = advanceSemaSchedule(current.sheetSchedule, direction);
      if (nextViewing.currentIndex === current.sheetSchedule.currentIndex) {
        return current;
      }
      this.patch(projectId, {
        viewing_current_index: nextViewing.currentIndex,
        viewing_current_row_id: nextViewing.currentRowId,
      });
      return this.getState(projectId);
    }

    const nextSchedule = advanceSemaSchedule(current.liveSchedule, direction);
    if (nextSchedule.currentIndex === current.liveSchedule.currentIndex) {
      return current;
    }
    this.saveLivePosition(projectId, nextSchedule);
    this.autoRemoveScheduledHighlightIfDue(projectId);
    this.publish(projectId, "navigation", {
      newSelection: current.sourceMode === "google-sheets",
    });
    return this.getState(projectId);
  }

  /**
   * Jump to a table row. When the target worksheet differs from live, promote
   * that worksheet to live atomically, then set NOW/NEXT/LATER from the jump.
   * Failed validation leaves the previous live schedule untouched.
   */
  async jump(
    projectId: string,
    rowIdOrIndex: string | number,
    options?: { worksheetGid?: string | null },
  ): Promise<SemaPersistedState> {
    const current = this.getState(projectId);
    const requestedGid =
      typeof options?.worksheetGid === "string" && options.worksheetGid.trim()
        ? options.worksheetGid.trim()
        : current.viewing.worksheetGid ?? current.sheet.worksheetGid ?? null;

    if (requestedGid && !/^\d{1,20}$/.test(requestedGid)) {
      throw new Error("Worksheet gid must be a number (see the #gid= value in the sheet URL).");
    }

    const targetIsLive = sameWorksheetGid(requestedGid, current.sheet.worksheetGid);

    // Resolve the schedule used for the jump target without mutating live yet.
    let targetSchedule = current.sheetSchedule;
    let targetTitle = current.viewing.worksheetTitle ?? current.sheet.worksheetTitle ?? null;

    if (!targetIsLive) {
      const viewingMatchesRequest = sameWorksheetGid(
        requestedGid,
        current.viewing.worksheetGid,
      );
      if (!viewingMatchesRequest || current.sheetSchedule.rows.length === 0) {
        if (!current.sheet.spreadsheetId || !requestedGid) {
          throw new Error("Configure a Google Sheet and select a worksheet before Jump.");
        }
        let fetched;
        try {
          fetched = await fetchSemaSheetSchedule(
            {
              spreadsheetId: current.sheet.spreadsheetId,
              worksheetGid: requestedGid,
              worksheetTitle: targetTitle,
              accessMode: "public-csv",
              pollIntervalMs: current.sheet.pollIntervalMs,
            },
            null,
            this.fetchImpl,
          );
        } catch (error) {
          throw new Error(
            `Unable to load the target worksheet for Jump. Live schedule unchanged. (${
              error instanceof Error ? error.message : String(error)
            })`,
          );
        }
        if (fetched.error) {
          throw new Error(
            `Unable to load the target worksheet for Jump. Live schedule unchanged. (${fetched.error})`,
          );
        }
        if (fetched.rows.length === 0) {
          throw new Error(
            "The target worksheet has no schedule rows. Live schedule unchanged.",
          );
        }
        targetSchedule = buildSemaScheduleState({
          rows: fetched.rows,
          currentIndex: 0,
          source: "google-sheets",
          updatedAt: fetched.fetchedAt,
        });
        // Persist viewing cache for the fetched tab (still not live).
        this.patch(projectId, {
          viewing_worksheet_gid: requestedGid,
          viewing_worksheet_title: targetTitle,
          viewing_rows_json: JSON.stringify(fetched.rows),
          viewing_content_hash: fetched.contentHash,
          viewing_current_index: 0,
          viewing_current_row_id: fetched.rows[0]?.stableRowId ?? null,
          viewing_last_success_at: fetched.fetchedAt,
          viewing_last_error: null,
        });
      } else {
        targetSchedule = current.sheetSchedule;
        targetTitle = current.viewing.worksheetTitle ?? targetTitle;
      }
    } else {
      targetSchedule = current.liveSchedule;
    }

    if (typeof rowIdOrIndex === "string") {
      if (!targetSchedule.rows.some((row) => row.stableRowId === rowIdOrIndex)) {
        throw new Error(
          "That schedule row is no longer available on the selected worksheet. Live schedule unchanged.",
        );
      }
    } else if (
      !Number.isInteger(rowIdOrIndex) ||
      rowIdOrIndex < 0 ||
      rowIdOrIndex >= targetSchedule.rows.length
    ) {
      throw new Error("Row index is out of range. Live schedule unchanged.");
    }

    const jumped = jumpSemaSchedule(targetSchedule, rowIdOrIndex);

    if (!targetIsLive) {
      // Atomic promote: one patch writes live worksheet + position together.
      this.patch(projectId, {
        sheet_worksheet_gid: requestedGid,
        sheet_worksheet_title: targetTitle,
        rows_json: JSON.stringify(targetSchedule.rows),
        content_hash: null,
        current_index: jumped.currentIndex,
        current_row_id: jumped.currentRowId,
        last_error: null,
        last_success_at: this.now().toISOString(),
        viewing_worksheet_gid: requestedGid,
        viewing_worksheet_title: targetTitle,
        viewing_rows_json: JSON.stringify(targetSchedule.rows),
        viewing_current_index: jumped.currentIndex,
        viewing_current_row_id: jumped.currentRowId,
        viewing_last_error: null,
      });
      this.autoRemoveScheduledHighlightIfDue(projectId);
      this.publish(projectId, "navigation", {
        newSelection: current.sourceMode === "google-sheets",
      });
      if (this.pollingProjects.has(projectId)) {
        this.startPolling(projectId);
      }
      return this.getState(projectId);
    }

    this.saveLivePosition(projectId, jumped);
    this.autoRemoveScheduledHighlightIfDue(projectId);
    this.publish(projectId, "navigation", {
      newSelection: current.sourceMode === "google-sheets",
    });
    return this.getState(projectId);
  }

  /** NOW: re-send the current selection to displays (replays the staged advance). */
  takeNow(projectId: string): SemaPersistedState {
    this.publish(projectId, "now", { newSelection: true });
    return this.getState(projectId);
  }

  private saveLivePosition(projectId: string, schedule: SemaScheduleState): void {
    this.patch(projectId, {
      current_index: schedule.currentIndex,
      current_row_id: schedule.currentRowId,
      // Keep viewing cursor aligned when viewing the live worksheet.
      viewing_current_index: schedule.currentIndex,
      viewing_current_row_id: schedule.currentRowId,
    });
  }

  // ---------------------------------------------------------------------------
  // Sheet refresh
  // ---------------------------------------------------------------------------

  refreshFromSheet(projectId: string): Promise<SemaRefreshResult> {
    const existing = this.inFlight.get(projectId);
    if (existing) {
      return existing;
    }
    const run = this.performRefresh(projectId).finally(() => {
      this.inFlight.delete(projectId);
    });
    this.inFlight.set(projectId, run);
    return run;
  }

  private recordFailure(projectId: string, message: string, offline: boolean): SemaRefreshResult {
    // Failure never touches the cache, the position, or the revision: the display keeps
    // showing the last-known schedule. Only health metadata changes.
    const before = this.getState(projectId);
    this.patch(projectId, {
      last_error: message,
      last_attempt_at: this.now().toISOString(),
    });
    const state = this.getState(projectId);
    const becameStale = !before.stale && state.stale;
    if (becameStale) {
      // Let the control surfaces know (display payload carries `stale`); no staged advance.
      this.publish(projectId, "sheet", { newSelection: false });
    }
    return {
      state: this.getState(projectId),
      unchanged: true,
      published: becameStale,
      offline,
    };
  }

  private async performRefresh(projectId: string): Promise<SemaRefreshResult> {
    const current = this.getState(projectId);
    if (!current.sheet.spreadsheetId) {
      return this.recordFailure(projectId, "Google Sheet is not configured.", false);
    }

    const row = this.readRow(projectId);
    let result;
    try {
      result = await fetchSemaSheetSchedule(
        current.sheet,
        row?.content_hash ?? null,
        this.fetchImpl,
      );
    } catch (error) {
      return this.recordFailure(projectId, describeFetchError(error), true);
    }

    if (result.error) {
      // Incompatible columns / parse failures must not replace a valid cache
      // (e.g. after switching to a worksheet that is not a schedule).
      return this.recordFailure(projectId, result.error, false);
    }

    const cached = parseRows(row?.rows_json ?? "[]");
    if (result.rows.length === 0 && cached.length > 0) {
      return this.recordFailure(
        projectId,
        "Sheet returned no schedule rows. Keeping last-known schedule.",
        false,
      );
    }

    const attemptedAt = this.now().toISOString();

    if (result.unchanged) {
      // Same content hash: no canonical update, no revision bump, no display event.
      this.patch(
        projectId,
        { last_success_at: result.fetchedAt, last_attempt_at: attemptedAt, last_error: null },
        { touchUpdatedAt: false },
      );
      const wasStale = current.stale;
      // Position may already make a scheduled Highlight due (e.g. after jump before poll).
      const highlightRemoved = this.autoRemoveScheduledHighlightIfDue(projectId);
      if (wasStale || highlightRemoved) {
        this.publish(projectId, "sheet", { newSelection: false });
      }
      return {
        state: this.getState(projectId),
        unchanged: true,
        published: wasStale || highlightRemoved,
        offline: false,
      };
    }

    const nextIndex = reconcileSemaSelection({
      previousRows: cached,
      previousIndex: row?.current_index ?? 0,
      nextRows: result.rows,
    });
    const nextRow = result.rows[nextIndex] ?? null;

    this.patch(projectId, {
      rows_json: JSON.stringify(result.rows),
      current_index: nextIndex,
      current_row_id: nextRow?.stableRowId ?? null,
      content_hash: result.contentHash,
      last_success_at: result.fetchedAt,
      last_attempt_at: attemptedAt,
      last_error: null,
    });

    const highlightRemoved = this.autoRemoveScheduledHighlightIfDue(projectId);
    const publishesToDisplay =
      current.sourceMode === "google-sheets" || highlightRemoved;
    if (publishesToDisplay) {
      // Live edit: content swaps in place; selection token is unchanged.
      this.publish(projectId, "sheet", { newSelection: false });
    }

    return {
      state: this.getState(projectId),
      unchanged: false,
      published: publishesToDisplay,
      offline: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Polling (always refreshes the cache, regardless of the active source mode)
  // ---------------------------------------------------------------------------

  startPolling(projectId: string): void {
    this.clearTimer(projectId);
    this.pollingProjects.add(projectId);
    this.scheduleNextPoll(projectId, 1_000);
  }

  private scheduleNextPoll(projectId: string, delayMs?: number): void {
    if (!this.pollingProjects.has(projectId)) return;
    const delay =
      delayMs ?? clampSheetsPollInterval(this.getState(projectId).sheet.pollIntervalMs);
    const timer = setTimeout(() => {
      this.pollTimers.delete(projectId);
      if (!this.pollingProjects.has(projectId)) return;
      const state = this.getState(projectId);
      if (!state.sheet.spreadsheetId) {
        // Sheet removed or project deleted: nothing left to poll.
        this.stopPolling(projectId);
        return;
      }
      void this.refreshFromSheet(projectId)
        .catch((error) => {
          console.warn("[sema] poll refresh failed", error);
        })
        .finally(() => this.scheduleNextPoll(projectId));
    }, delay);
    timer.unref?.();
    this.pollTimers.set(projectId, timer);
  }

  /** Starts polling for every project that already has a configured sheet. */
  startPollingConfiguredProjects(): string[] {
    const rows = this.db
      .prepare(
        `SELECT project_id FROM sema_schedule_state
         WHERE sheet_spreadsheet_id IS NOT NULL AND sheet_spreadsheet_id != ''`,
      )
      .all() as Array<{ project_id: string }>;
    for (const { project_id } of rows) {
      this.startPolling(project_id);
    }
    return rows.map((row) => row.project_id);
  }

  isPolling(projectId: string): boolean {
    return this.pollingProjects.has(projectId);
  }

  private clearTimer(projectId: string): void {
    const timer = this.pollTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.pollTimers.delete(projectId);
    }
  }

  stopPolling(projectId: string): void {
    this.pollingProjects.delete(projectId);
    this.clearTimer(projectId);
  }

  stopAllPolling(): void {
    for (const projectId of [...this.pollingProjects]) {
      this.stopPolling(projectId);
    }
  }
}
