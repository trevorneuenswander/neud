import crypto from "crypto";
import {
  parseSemaSheetRows,
  scheduleContentHash,
  type SemaScheduleRow,
} from "./canonical-schedule";

export type GoogleSheetsAdapterConfig = {
  spreadsheetId: string;
  worksheetGid?: string | null;
  worksheetTitle?: string | null;
  /**
   * v1 supports `public-csv` only (published/"anyone with link" sheets, no secrets involved).
   * `api` is reserved for private sheets via Google OAuth/service account, which is deferred.
   * Credential boundary for that future mode: tokens live in the main process OS credential
   * store only. They must never be written to the project package, the SQLite state table,
   * the renderer/preload, or any display payload.
   */
  accessMode: "public-csv" | "api";
  pollIntervalMs?: number;
};

export type GoogleSheetsFetchResult = {
  rows: SemaScheduleRow[];
  contentHash: string;
  fetchedAt: string;
  unchanged: boolean;
  error: string | null;
  sourceUrl: string;
};

const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_MS = 15_000;
const MIN_POLL_MS = 1_000;
const MAX_POLL_MS = 120_000;

export function clampSheetsPollInterval(ms: number | undefined): number {
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    return DEFAULT_POLL_MS;
  }
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.floor(ms)));
}

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

/**
 * Public CSV export URL. Suitable when the sheet is published or shared as
 * "anyone with the link can view". Private sheets require API/OAuth later;
 * credentials must never ship in the project package.
 */
export function buildPublicCsvExportUrl(config: GoogleSheetsAdapterConfig): string {
  const params = new URLSearchParams({ format: "csv" });
  if (config.worksheetGid) {
    params.set("gid", config.worksheetGid);
  }
  return `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/export?${params.toString()}`;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char === "\r") {
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export async function fetchSemaSheetSchedule(
  config: GoogleSheetsAdapterConfig,
  previousHash: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleSheetsFetchResult> {
  if (config.accessMode !== "public-csv") {
    return {
      rows: [],
      contentHash: previousHash ?? "",
      fetchedAt: new Date().toISOString(),
      unchanged: true,
      error:
        "Private Google Sheets API access is not configured. Use a published/readable sheet (public-csv) or configure secure credentials outside the project package.",
      sourceUrl: "",
    };
  }

  const sourceUrl = buildPublicCsvExportUrl(config);
  const response = await fetchImpl(sourceUrl, {
    headers: { Accept: "text/csv" },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    return {
      rows: [],
      contentHash: previousHash ?? "",
      fetchedAt: new Date().toISOString(),
      unchanged: true,
      error: `Google Sheets fetch failed (${response.status}).`,
      sourceUrl,
    };
  }

  const contentType = response.headers?.get?.("content-type") ?? "";
  if (/text\/html/i.test(contentType)) {
    // Unpublished/private sheets redirect to a Google sign-in page instead of returning CSV.
    return {
      rows: [],
      contentHash: previousHash ?? "",
      fetchedAt: new Date().toISOString(),
      unchanged: true,
      error:
        'Google returned a sign-in page. Publish the sheet or share it as "Anyone with the link can view" (public CSV).',
      sourceUrl,
    };
  }

  const csv = await response.text();
  const values = parseCsv(csv);
  const parsed = parseSemaSheetRows(values, { hasHeader: true });
  const contentHash = crypto
    .createHash("sha256")
    .update(scheduleContentHash(parsed.rows))
    .digest("hex");

  return {
    rows: parsed.rows,
    contentHash,
    fetchedAt: new Date().toISOString(),
    unchanged: Boolean(previousHash && previousHash === contentHash),
    error: parsed.error,
    sourceUrl,
  };
}
