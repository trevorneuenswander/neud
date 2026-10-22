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
  fetchSemaSheetSchedule,
  type GoogleSheetsAdapterConfig,
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
  manual_date: string | null;
  manual_time: string | null;
  manual_title: string | null;
  manual_description: string | null;
  manual_next_title: string | null;
  manual_next_description: string | null;
  manual_later_title: string | null;
  manual_later_description: string | null;
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

export type SemaPersistedState = {
  projectId: string;
  sourceMode: "google-sheets" | "manual";
  /** Effective on-air schedule: manual slots in manual mode, otherwise the sheet cache. */
  schedule: SemaScheduleState;
  /**
   * Google Sheet cache + operator position. Always available for Data Source navigation,
   * even while Manual Controller values are on air.
   */
  sheetSchedule: SemaScheduleState;
  sheet: GoogleSheetsAdapterConfig;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  manual: SemaManualFields;
  /** Rows held in the last-known sheet cache (independent of the active source mode). */
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
  | "sheet"
  | "config";

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
        sheet: { ...DEFAULT_SHEET_CONFIG },
        lastSuccessAt: null,
        lastAttemptAt: null,
        lastError: null,
        manual,
        cacheRowCount: 0,
        stale: false,
        selectionToken: "sel-0",
        revision: 0,
        updatedAt: this.now().toISOString(),
      };
    }

    const sourceMode = row.source_mode === "manual" ? "manual" : "google-sheets";
    const cachedRows = parseRows(row.rows_json);
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

    const sheetSchedule = buildSemaScheduleState({
      rows: cachedRows,
      currentIndex: row.current_index,
      currentRowId: row.current_row_id,
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
        : sheetSchedule;

    return {
      projectId,
      sourceMode,
      schedule,
      sheetSchedule,
      sheet: {
        spreadsheetId: row.sheet_spreadsheet_id ?? "",
        worksheetGid: row.sheet_worksheet_gid,
        worksheetTitle: row.sheet_worksheet_title,
        accessMode: row.sheet_access_mode === "api" ? "api" : "public-csv",
        pollIntervalMs: clampSheetsPollInterval(row.poll_interval_ms),
      },
      lastSuccessAt: row.last_success_at,
      lastAttemptAt: row.last_attempt_at,
      lastError: row.last_error,
      manual,
      cacheRowCount: cachedRows.length,
      stale:
        sourceMode === "google-sheets" && Boolean(row.last_error) && cachedRows.length > 0,
      selectionToken: `sel-${row.selection_seq}`,
      revision: row.state_revision,
      updatedAt: row.updated_at,
    };
  }

  /** Minimal payload the Schedule Ticker needs (no full sheet, no config, no credentials). */
  toDisplayPayload(projectId: string): SemaDisplayPayload {
    const state = this.getState(projectId);
    const schedule = buildSemaDisplaySchedule({
      state: state.schedule,
      selectionToken: state.selectionToken,
      stale: state.stale,
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
    const worksheetGid =
      input.worksheetGid === undefined
        ? undefined
        : input.worksheetGid === null || input.worksheetGid.trim() === ""
          ? null
          : input.worksheetGid.trim();
    if (worksheetGid && !/^\d{1,20}$/.test(worksheetGid)) {
      throw new Error("Worksheet gid must be a number (see the #gid= value in the sheet URL).");
    }

    const current = this.getState(projectId);
    const nextGid = worksheetGid === undefined ? (current.sheet.worksheetGid ?? null) : worksheetGid;
    const sheetChanged =
      current.sheet.spreadsheetId !== spreadsheetId ||
      (current.sheet.worksheetGid ?? null) !== nextGid;

    const fields: Record<string, string | number | null> = {
      sheet_spreadsheet_id: spreadsheetId,
      sheet_worksheet_gid: nextGid,
      sheet_worksheet_title: input.worksheetTitle ?? current.sheet.worksheetTitle ?? null,
      sheet_access_mode: "public-csv",
      poll_interval_ms: clampSheetsPollInterval(
        input.pollIntervalMs ?? current.sheet.pollIntervalMs,
      ),
    };
    if (sheetChanged) {
      // A different sheet invalidates the old cache and position.
      fields.rows_json = "[]";
      fields.current_index = 0;
      fields.current_row_id = null;
      fields.content_hash = null;
      fields.last_success_at = null;
      fields.last_error = null;
    }
    this.patch(projectId, fields);

    if (sheetChanged && current.sourceMode === "google-sheets") {
      this.publish(projectId, "config", { newSelection: true });
    }
    if (this.pollingProjects.has(projectId)) {
      this.startPolling(projectId);
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
    // Always move the Google Sheets cache cursor — never change sourceMode here.
    const nextSchedule = advanceSemaSchedule(current.sheetSchedule, direction);
    if (nextSchedule.currentIndex === current.sheetSchedule.currentIndex) {
      return current;
    }
    this.savePosition(projectId, nextSchedule);
    // Publish to on-air displays only when Google Sheets is the selected source.
    this.publish(projectId, "navigation", {
      newSelection: current.sourceMode === "google-sheets",
    });
    return this.getState(projectId);
  }

  jump(projectId: string, rowIdOrIndex: string | number): SemaPersistedState {
    const current = this.getState(projectId);
    if (typeof rowIdOrIndex === "string") {
      if (!current.sheetSchedule.rows.some((row) => row.stableRowId === rowIdOrIndex)) {
        throw new Error("That schedule row is no longer available.");
      }
    } else if (
      !Number.isInteger(rowIdOrIndex) ||
      rowIdOrIndex < 0 ||
      rowIdOrIndex >= current.sheetSchedule.rows.length
    ) {
      throw new Error("Row index is out of range.");
    }
    const nextSchedule = jumpSemaSchedule(current.sheetSchedule, rowIdOrIndex);
    this.savePosition(projectId, nextSchedule);
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

  private savePosition(projectId: string, schedule: SemaScheduleState): void {
    this.patch(projectId, {
      current_index: schedule.currentIndex,
      current_row_id: schedule.currentRowId,
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

    if (result.error && result.rows.length === 0) {
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
      if (wasStale) {
        this.publish(projectId, "sheet", { newSelection: false });
      }
      return {
        state: this.getState(projectId),
        unchanged: true,
        published: wasStale,
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

    const publishesToDisplay = current.sourceMode === "google-sheets";
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
