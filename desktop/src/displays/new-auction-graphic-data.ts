import {
  mapLiveStateToLowerTickerFeed,
  mapSnapshotToLowerTickerFeed,
} from "./lower-ticker-data";
import { mapLiveStateToPylonFeed, mapSnapshotToPylonFeed } from "./pylon-data";
import { resolveEffectiveDisplayData } from "./resolve-effective-display-data";
import { resolveReserveStatusDisplayLabel, getVisibleReserveLabel, normalizeReserveStatus } from "../bag/reserve-status";
import type { DisplayDataSource } from "./display-data-source";

export type NewAuctionGraphicCurrencyCode = "EUR" | "GBP" | "CHF" | "JPY";

export type NewAuctionGraphicPayload = {
  source: DisplayDataSource;
  enabled: boolean;
  status: string;
  revision: number;
  updatedAt: string | null;
  current: {
    lot: string | null;
    year?: string | null;
    title: string | null;
    reserveStatus?: string | null;
    biddingPrice: string | null;
    primaryCurrency: string | null;
    currencies: Partial<Record<NewAuctionGraphicCurrencyCode, string | null>>;
    photos: string[];
    pipSource: {
      type: "image" | "video";
      url: string;
    } | null;
  };
  next: Array<{
    lot: string;
    year?: string | null;
    title: string;
  }>;
};

const CONVERSION_CODES: NewAuctionGraphicCurrencyCode[] = ["EUR", "GBP", "CHF", "JPY"];

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function isMissing(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  return !trimmed || trimmed === "—" || trimmed === "-";
}

function formatLotLabel(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed === "—") return null;
  if (/^lot\s+/i.test(trimmed)) return trimmed;
  return `Lot ${trimmed}`;
}

function hasBidValue(value: string | null | undefined): boolean {
  const v = (value ?? "").toString().trim();
  if (!v || v === "—") return false;
  if (/^\$?\s*0(?:\.00)?$/i.test(v)) return false;
  return /\d/.test(v);
}

function parsePrimaryCurrency(biddingPrice: string | null, source: DisplayDataSource): string | null {
  if (!hasBidValue(biddingPrice)) return null;
  if (source === "local-controller") return "USD";
  const match = (biddingPrice ?? "").match(/^([$€£¥])/);
  if (match?.[1] === "$") return "USD";
  if (match?.[1] === "€") return "EUR";
  if (match?.[1] === "£") return "GBP";
  if (match?.[1] === "¥") return "JPY";
  return "USD";
}

function formatNumber(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = Number(raw.replace(/[',]/g, ""));
  if (Number.isFinite(numeric)) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(numeric);
  }
  return raw;
}

function parseCurrencyStrings(rows: string[]): Partial<Record<NewAuctionGraphicCurrencyCode, string | null>> {
  const result: Partial<Record<NewAuctionGraphicCurrencyCode, string | null>> = {};
  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed) continue;
    for (const code of CONVERSION_CODES) {
      const match = trimmed.match(new RegExp(`^${code}\\b[:\\s-]*(.+)$`, "i"));
      if (match) {
        result[code] = formatNumber(match[1] ?? null);
      }
    }
  }
  return result;
}

function parsePositionalCurrencyArray(
  rows: string[],
): Partial<Record<NewAuctionGraphicCurrencyCode, string | null>> {
  const result: Partial<Record<NewAuctionGraphicCurrencyCode, string | null>> = {};
  for (let index = 0; index < CONVERSION_CODES.length && index < rows.length; index += 1) {
    const formatted = formatNumber(rows[index]);
    if (formatted) {
      result[CONVERSION_CODES[index]] = formatted;
    }
  }
  return result;
}

function resolveCurrencyRows(
  rows: string[],
): Partial<Record<NewAuctionGraphicCurrencyCode, string | null>> {
  const coded = parseCurrencyStrings(rows);
  if (Object.keys(coded).length > 0) {
    return coded;
  }
  return parsePositionalCurrencyArray(rows);
}

function readObjectCurrencies(
  raw: Record<string, unknown> | null | undefined,
): Partial<Record<NewAuctionGraphicCurrencyCode, string | null>> {
  if (!raw) return {};
  const result: Partial<Record<NewAuctionGraphicCurrencyCode, string | null>> = {};
  for (const code of CONVERSION_CODES) {
    const value = raw[code];
    if (value != null) {
      result[code] = formatNumber(value as string | number);
    }
  }
  return result;
}

function buildTitle(
  title: string | null | undefined,
  year: string | null | undefined,
): string | null {
  const base = (title ?? "").trim();
  const yr = (year ?? "").trim();
  if (!base && !yr) return null;
  if (yr && base && !base.startsWith(yr)) {
    return `${yr} ${base}`.trim();
  }
  return base || yr || null;
}

function readPipSource(
  auctionDisplay: Record<string, unknown> | null,
): NewAuctionGraphicPayload["current"]["pipSource"] {
  if (!auctionDisplay) return null;
  const pip = auctionDisplay.pipSource ?? auctionDisplay.pip;
  if (!pip || typeof pip !== "object") return null;
  const row = pip as Record<string, unknown>;
  const url = asString(row.url).trim();
  if (!url) return null;
  const type = row.type === "video" ? "video" : "image";
  return { type, url };
}

export function buildNewAuctionGraphicPayload(input: {
  source: DisplayDataSource;
  scraperSnapshot: Record<string, unknown> | null;
  localControllerState: ReturnType<typeof resolveEffectiveDisplayData>["localControllerState"];
  submittedState?: Record<string, unknown> | null;
  dataset?: Record<string, unknown> | null;
  revision?: number;
  enabled?: boolean;
  status?: string;
}): NewAuctionGraphicPayload {
  const effective = resolveEffectiveDisplayData({
    source: input.source,
    scraperSnapshot: input.scraperSnapshot,
    localControllerState: input.localControllerState,
    submittedState: input.submittedState,
    dataset: input.dataset,
  });

  const pylonFeed =
    input.source === "local-controller"
      ? mapLiveStateToPylonFeed(input.localControllerState)
      : mapSnapshotToPylonFeed(input.scraperSnapshot);

  const tickerFeed =
    input.source === "local-controller"
      ? mapLiveStateToLowerTickerFeed(input.localControllerState)
      : mapSnapshotToLowerTickerFeed(input.scraperSnapshot);

  const auctionDisplay = pylonFeed.auctionDisplay;
  const biddingPrice = hasBidValue(auctionDisplay.biddingPrice)
    ? auctionDisplay.biddingPrice
    : null;

  const currencyStrings = Array.isArray(auctionDisplay.currencies)
    ? auctionDisplay.currencies.filter((entry): entry is string => typeof entry === "string")
    : [];

  let currencies = resolveCurrencyRows(currencyStrings);
  if (Object.keys(currencies).length === 0) {
    const manualRows = Array.isArray(input.submittedState?.manualBidConversions)
      ? input.submittedState.manualBidConversions.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [];
    if (manualRows.length > 0) {
      currencies = resolveCurrencyRows(manualRows);
    }
  }
  if (Object.keys(currencies).length === 0 && input.submittedState?.auctionDisplay) {
    const auctionDisplay = input.submittedState.auctionDisplay as Record<string, unknown>;
    if (Array.isArray(auctionDisplay.currencies)) {
      currencies = resolveCurrencyRows(
        auctionDisplay.currencies.filter((entry): entry is string => typeof entry === "string"),
      );
    } else {
      currencies = readObjectCurrencies(auctionDisplay);
    }
  }

  const rawAuction =
    input.source === "webpage-scraper" &&
    input.scraperSnapshot &&
    typeof input.scraperSnapshot.auctionDisplay === "object"
      ? (input.scraperSnapshot.auctionDisplay as Record<string, unknown>)
      : input.submittedState?.auctionDisplay &&
          typeof input.submittedState.auctionDisplay === "object"
        ? (input.submittedState.auctionDisplay as Record<string, unknown>)
        : null;

  let reserveStatus = isMissing(auctionDisplay.reserveStatus)
    ? null
    : getVisibleReserveLabel(normalizeReserveStatus(auctionDisplay.reserveStatus));
  if (!reserveStatus && rawAuction) {
    const rawReserve = asString(rawAuction.reserveStatus);
    if (!isMissing(rawReserve)) {
      reserveStatus = getVisibleReserveLabel(normalizeReserveStatus(rawReserve));
    }
  }

  return {
    source: input.source,
    enabled: input.enabled ?? true,
    status: input.status ?? "ok",
    revision: input.revision ?? 0,
    updatedAt: new Date().toISOString(),
    current: {
      lot: formatLotLabel(auctionDisplay.lot),
      year: isMissing(auctionDisplay.year) ? null : auctionDisplay.year,
      title: buildTitle(auctionDisplay.title, auctionDisplay.year),
      reserveStatus,
      biddingPrice,
      primaryCurrency: parsePrimaryCurrency(biddingPrice, input.source),
      currencies,
      photos: auctionDisplay.photos.filter(Boolean),
      pipSource: readPipSource(rawAuction),
    },
    next: tickerFeed.next
      .filter((entry) => entry.lot && entry.lot !== "—" && entry.title)
      .map((entry) => ({
        lot: formatLotLabel(entry.lot) ?? entry.lot,
        title: entry.title,
      })),
  };
}

export function buildDemoNewAuctionGraphicPayload(): NewAuctionGraphicPayload {
  return {
    source: "webpage-scraper",
    enabled: true,
    status: "ok",
    revision: 0,
    updatedAt: new Date().toISOString(),
    current: {
      lot: "Lot 999",
      year: "1967",
      title: "1967 Ferrari 275 GTB/4 by Scaglietti",
      reserveStatus: "Offered Without Reserve",
      biddingPrice: "$44,000,000",
      primaryCurrency: "USD",
      currencies: {
        EUR: "38,635,520",
        GBP: "33,456,000",
        CHF: "36,960,000",
        JPY: "6,512,000,000",
      },
      photos: [],
      pipSource: null,
    },
    next: [
      { lot: "Lot 1000", title: "1955 Mercedes-Benz 300 SL Gullwing" },
      { lot: "Lot 1001", title: "1973 Porsche 911 Carrera RS 2.7 Touring" },
      { lot: "Lot 1002", title: "1938 Bugatti Type 57C Atalante" },
    ],
  };
}
