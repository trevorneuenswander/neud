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

/** Reads `#gid=` / `?gid=` / `&gid=` from a Sheets URL when present. */
export function extractWorksheetGidFromUrl(input: string): string | null {
  const match = input.trim().match(/[?#&]gid=(\d{1,20})/);
  return match?.[1] ?? null;
}

export type SpreadsheetWorksheet = {
  /** Google Sheets sheetId / export gid (stable across renames). */
  gid: string;
  title: string;
  index: number;
};

export type ListWorksheetsResult = {
  worksheets: SpreadsheetWorksheet[];
  sourceUrl: string;
  error: string | null;
  /** Which discovery path succeeded (for diagnostics). */
  method: "feeds" | "htmlview" | "edit" | "none";
};

/**
 * Parse worksheet id/title pairs from a public Sheets HTML/preview document.
 * Prefer sheetId (gid) over title for selection stability.
 */
export function parseWorksheetsFromHtml(html: string): SpreadsheetWorksheet[] {
  const byGid = new Map<string, { title: string; index: number }>();

  function add(gid: string, titleRaw: string) {
    if (!/^\d{1,20}$/.test(gid)) return;
    const title = decodeJsonString(titleRaw).trim() || `Sheet ${gid}`;
    if (!byGid.has(gid)) {
      byGid.set(gid, { title, index: byGid.size });
    }
  }

  // Modern Sheets bootstrap: {"sheetId":0,"title":"Main"} (order may vary).
  const propertyPattern =
    /\{\s*"sheetId"\s*:\s*(\d+)\s*,\s*"title"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;
  while ((match = propertyPattern.exec(html)) !== null) {
    add(match[1]!, match[2]!);
  }

  // Title before sheetId (common in properties objects).
  if (byGid.size === 0) {
    const titleFirst =
      /\{\s*"title"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"sheetId"\s*:\s*(\d+)/g;
    while ((match = titleFirst.exec(html)) !== null) {
      add(match[2]!, match[1]!);
    }
  }

  // sheetId anywhere near a title within the same object-ish span.
  if (byGid.size === 0) {
    const loose =
      /"sheetId"\s*:\s*(\d+)[\s\S]{0,120}?"title"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    while ((match = loose.exec(html)) !== null) {
      add(match[1]!, match[2]!);
    }
  }

  if (byGid.size === 0) {
    const altPattern =
      /"name"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"gid"\s*:\s*"?(\d+)"?/g;
    while ((match = altPattern.exec(html)) !== null) {
      add(match[2]!, match[1]!);
    }
  }

  // htmlview page switcher (JS object literals, unquoted keys):
  // items.push({name: "DAY 1", pageUrl: "...", gid: "0", initialSheet: ...})
  if (byGid.size === 0) {
    const itemsPush =
      /items\.push\(\{\s*name:\s*"((?:\\.|[^"\\])*)"[\s\S]{0,500}?gid:\s*"(\d{1,20})"/g;
    while ((match = itemsPush.exec(html)) !== null) {
      add(match[2]!, match[1]!);
    }
  }

  if (byGid.size === 0) {
    const itemsPushGidFirst =
      /items\.push\(\{\s*gid:\s*"(\d{1,20})"[\s\S]{0,500}?name:\s*"((?:\\.|[^"\\])*)"/g;
    while ((match = itemsPushGidFirst.exec(html)) !== null) {
      add(match[1]!, match[2]!);
    }
  }

  if (byGid.size === 0) {
    const unicodePattern =
      /sheetId\\u003d(\d+)[\s\S]{0,120}?title\\u003d\\?"([^"\\]+)/g;
    while ((match = unicodePattern.exec(html)) !== null) {
      add(match[1]!, match[2]!);
    }
  }

  // htmlview sheets bar: <li id="sheet-button-0" ...>Title</li> or data-id / gid links.
  if (byGid.size === 0) {
    const buttonPattern =
      /id=["']sheet-button-(\d+)["'][^>]*>\s*([^<]{1,120}?)\s*</gi;
    while ((match = buttonPattern.exec(html)) !== null) {
      add(match[1]!, match[2]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").trim());
    }
  }

  if (byGid.size === 0) {
    const gidLink = /[#?&]gid=(\d+)[^>]{0,200}?aria-label=["']([^"']+)["']/gi;
    while ((match = gidLink.exec(html)) !== null) {
      add(match[1]!, match[2]!);
    }
  }

  return Array.from(byGid.entries())
    .map(([gid, meta]) => ({ gid, title: meta.title, index: meta.index }))
    .sort((left, right) => left.index - right.index);
}

/**
 * Parse the legacy public worksheets Atom/JSON feed (still served for many
 * "anyone with the link" spreadsheets without OAuth).
 */
export function parseWorksheetsFromFeedsJson(payload: unknown): SpreadsheetWorksheet[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const feed = (payload as { feed?: { entry?: unknown } }).feed;
  const entries = feed?.entry;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  const worksheets: SpreadsheetWorksheet[] = [];

  list.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const record = entry as {
      title?: { $t?: string } | string;
      link?: Array<{ rel?: string; href?: string }>;
      id?: { $t?: string } | string;
    };
    const titleRaw =
      typeof record.title === "string"
        ? record.title
        : typeof record.title?.$t === "string"
          ? record.title.$t
          : "";
    const links = Array.isArray(record.link) ? record.link : [];
    let gid: string | null = null;
    for (const link of links) {
      const href = typeof link.href === "string" ? link.href : "";
      const gidMatch = href.match(/[?#&]gid=(\d{1,20})/);
      if (gidMatch) {
        gid = gidMatch[1]!;
        break;
      }
    }
    if (!gid) {
      const idValue =
        typeof record.id === "string"
          ? record.id
          : typeof record.id?.$t === "string"
            ? record.id.$t
            : "";
      const odMatch = idValue.match(/od(?:6|4)=([a-zA-Z0-9]+)/);
      // Fallback: last path segment sometimes encodes sheet; prefer numeric gid only.
      if (odMatch && /^\d+$/.test(odMatch[1]!)) {
        gid = odMatch[1]!;
      }
    }
    if (!gid) return;
    worksheets.push({
      gid,
      title: titleRaw.trim() || `Sheet ${gid}`,
      index: worksheets.length || index,
    });
  });

  return worksheets;
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
  }
}

function looksLikeSignInHtml(html: string): boolean {
  return (
    /accounts\.google\.com\/ServiceLogin|Sign in to continue|identifierId/i.test(html) &&
    !/"sheetId"/i.test(html) &&
    !/sheet-button-/i.test(html) &&
    !/items\.push\(\{\s*name:\s*"/i.test(html)
  );
}

async function fetchText(
  url: string,
  fetchImpl: typeof fetch,
  accept: string,
): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  const response = await fetchImpl(url, {
    headers: { Accept: accept },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    text,
    finalUrl: typeof response.url === "string" && response.url ? response.url : url,
  };
}

/**
 * Discover worksheets for a publicly readable spreadsheet without OAuth.
 * Tries structured public feeds first, then htmlview / edit document parsing.
 */
export async function listPublicSpreadsheetWorksheets(
  spreadsheetId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ListWorksheetsResult> {
  const feedUrl = `https://spreadsheets.google.com/feeds/worksheets/${spreadsheetId}/public/basic?alt=json`;
  const htmlviewUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;
  const editUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`;

  let lastSourceUrl = feedUrl;
  let sawAuthWall = false;
  let sawHttpError: number | null = null;
  let sawParseAttempt = false;

  try {
    // 1) Legacy public worksheets feed — structured JSON, no OAuth for link-shared sheets.
    try {
      const feed = await fetchText(feedUrl, fetchImpl, "application/json,text/plain,*/*");
      lastSourceUrl = feed.finalUrl || feedUrl;
      if (feed.ok) {
        sawParseAttempt = true;
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(feed.text);
        } catch {
          parsed = null;
        }
        if (parsed) {
          const worksheets = parseWorksheetsFromFeedsJson(parsed);
          if (worksheets.length > 0) {
            return {
              worksheets,
              sourceUrl: lastSourceUrl,
              error: null,
              method: "feeds",
            };
          }
        }
      } else if (feed.status === 401 || feed.status === 403) {
        sawAuthWall = true;
      } else if (feed.status !== 404) {
        sawHttpError = feed.status;
      }
    } catch {
      // Fall through to HTML discovery.
    }

    // 2) htmlview (same share model as public CSV).
    try {
      const htmlview = await fetchText(htmlviewUrl, fetchImpl, "text/html");
      lastSourceUrl = htmlview.finalUrl || htmlviewUrl;
      if (htmlview.ok) {
        if (looksLikeSignInHtml(htmlview.text)) {
          sawAuthWall = true;
        } else {
          sawParseAttempt = true;
          const worksheets = parseWorksheetsFromHtml(htmlview.text);
          if (worksheets.length > 0) {
            return {
              worksheets,
              sourceUrl: lastSourceUrl,
              error: null,
              method: "htmlview",
            };
          }
        }
      } else if (htmlview.status === 401 || htmlview.status === 403) {
        sawAuthWall = true;
      } else {
        sawHttpError = htmlview.status;
      }
    } catch {
      // Fall through.
    }

    // 3) edit?usp=sharing often embeds full sheets.properties bootstrap JSON.
    try {
      const edit = await fetchText(editUrl, fetchImpl, "text/html");
      lastSourceUrl = edit.finalUrl || editUrl;
      if (edit.ok) {
        if (looksLikeSignInHtml(edit.text)) {
          sawAuthWall = true;
        } else {
          sawParseAttempt = true;
          const worksheets = parseWorksheetsFromHtml(edit.text);
          if (worksheets.length > 0) {
            return {
              worksheets,
              sourceUrl: lastSourceUrl,
              error: null,
              method: "edit",
            };
          }
        }
      } else if (edit.status === 401 || edit.status === 403) {
        sawAuthWall = true;
      } else {
        sawHttpError = edit.status;
      }
    } catch {
      // Fall through to typed error.
    }

    if (sawAuthWall) {
      return {
        worksheets: [],
        sourceUrl: lastSourceUrl,
        method: "none",
        error:
          'Google requires sign-in to list tabs. Publish the sheet or share it as "Anyone with the link can view". CSV polling may still work if already configured.',
      };
    }
    if (sawHttpError) {
      return {
        worksheets: [],
        sourceUrl: lastSourceUrl,
        method: "none",
        error: `Unable to reach Google Sheets metadata (${sawHttpError}). Confirm the spreadsheet URL and network access, then try Refresh Tabs.`,
      };
    }
    if (sawParseAttempt) {
      return {
        worksheets: [],
        sourceUrl: lastSourceUrl,
        method: "none",
        error:
          "The spreadsheet is reachable, but automatic tab discovery could not read worksheet metadata from Google’s public preview. Your selected worksheet and schedule cache are unchanged. Enter a worksheet gid manually (from the sheet URL #gid=) or try Refresh Tabs again.",
      };
    }
    return {
      worksheets: [],
      sourceUrl: lastSourceUrl,
      method: "none",
      error:
        "Worksheet tab listing is unavailable for this spreadsheet. Selected worksheet and cached schedule are unchanged.",
    };
  } catch (cause) {
    return {
      worksheets: [],
      sourceUrl: lastSourceUrl,
      method: "none",
      error:
        cause instanceof Error
          ? `Unable to list worksheet tabs: ${cause.message}`
          : "Unable to list worksheet tabs.",
    };
  }
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
