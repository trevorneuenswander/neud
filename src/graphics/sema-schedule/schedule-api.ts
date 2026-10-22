import { localFetch } from "@/lib/local/api";

export type SemaScheduleRow = {
  stableRowId: string;
  rowIndex: number;
  date: string;
  time: string;
  title: string;
  description: string;
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

export type SemaScheduleWindow = {
  rows: SemaScheduleRow[];
  currentIndex: number;
  currentRowId: string | null;
  now: SemaScheduleRow | null;
  next: SemaScheduleRow | null;
  later: SemaScheduleRow | null;
};

export type SemaControllerState = {
  sourceMode: "google-sheets" | "manual";
  /** Effective on-air Now / Next / Later. */
  schedule: SemaScheduleWindow;
  /** Google Sheet cache used by Data Source Previous / Next / Jump. */
  sheetSchedule: SemaScheduleWindow;
  sheet: {
    spreadsheetId: string;
    worksheetGid?: string | null;
    accessMode: "public-csv" | "api";
    pollIntervalMs?: number;
  };
  manual: SemaManualFields;
  cacheRowCount: number;
  stale: boolean;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  revision: number;
};

export type SemaRefreshOutcome = {
  state: SemaControllerState;
  unchanged: boolean;
  published: boolean;
  offline: boolean;
};

function base(slug: string): string {
  return `/api/projects/${encodeURIComponent(slug)}/sema`;
}

export function fetchSemaState(slug: string): Promise<SemaControllerState> {
  return localFetch<SemaControllerState>(`${base(slug)}/schedule`);
}

export function postSemaAction<T = SemaControllerState>(
  slug: string,
  action: "advance" | "now" | "jump" | "source" | "manual" | "sheet" | "refresh",
  body: Record<string, unknown> = {},
): Promise<T> {
  return localFetch<T>(`${base(slug)}/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: action === "refresh" ? 20_000 : undefined,
  });
}
