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

export type SemaHighlightSource = "scheduled" | "custom";

export type SemaHighlightState = {
  active: boolean;
  source: SemaHighlightSource | null;
  label: string;
  title: string;
  description: string;
  sourceRowId: string | null;
  sourceWorksheetGid?: string | null;
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
  /** Viewing worksheet rows shown in the Data Source table (may differ from live). */
  sheetSchedule: SemaScheduleWindow;
  /** Live worksheet schedule that drives graphics when Google Sheets is on air. */
  liveSchedule?: SemaScheduleWindow;
  sheet: {
    spreadsheetId: string;
    worksheetGid?: string | null;
    worksheetTitle?: string | null;
    accessMode: "public-csv" | "api";
    pollIntervalMs?: number;
  };
  viewing?: {
    worksheetGid: string | null;
    worksheetTitle: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
  };
  manual: SemaManualFields;
  highlight: SemaHighlightState;
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
  action:
    | "advance"
    | "now"
    | "jump"
    | "source"
    | "manual"
    | "sheet"
    | "viewing-sheet"
    | "refresh"
    | "highlight"
    | "worksheets",
  body: Record<string, unknown> = {},
): Promise<T> {
  return localFetch<T>(`${base(slug)}/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs:
      action === "refresh" || action === "worksheets" || action === "viewing-sheet"
        ? 20_000
        : undefined,
  });
}

export type SemaWorksheetTab = {
  gid: string;
  title: string;
  index: number;
};

export type SemaWorksheetsResponse = {
  worksheets: SemaWorksheetTab[];
  selectedGid: string | null;
  selectedTitle: string | null;
  error: string | null;
};

export function listSemaWorksheets(
  slug: string,
  spreadsheetUrlOrId?: string,
): Promise<SemaWorksheetsResponse> {
  return postSemaAction(slug, "worksheets", {
    spreadsheetUrlOrId: spreadsheetUrlOrId ?? "",
  });
}

export function setSemaHighlight(
  slug: string,
  body: {
    source: SemaHighlightSource;
    label?: string;
    title: string;
    description?: string;
    sourceRowId?: string | null;
  },
): Promise<SemaControllerState> {
  return postSemaAction(slug, "highlight", body);
}

export function removeSemaHighlight(slug: string): Promise<SemaControllerState> {
  return postSemaAction(slug, "highlight", { remove: true });
}

export function clearSemaHighlight(slug: string): Promise<SemaControllerState> {
  return postSemaAction(slug, "highlight", { clear: true });
}
