import type { BagSnapshotData } from "@/lib/data-engines/types";
import type { DisplayDataSource } from "./display-data-source";
import type { EffectiveDisplayLiveState } from "./resolve-effective-display-data";

export type CanonicalDataSource = "webpage-scraper" | "local-controller";

export type CanonicalProjectData = BagSnapshotData & {
  dataSource: CanonicalDataSource;
};

export type CanonicalProjectDataValidation =
  | { ok: true; data: CanonicalProjectData }
  | { ok: false; issues: string[] };

const CANONICAL_TOP_LEVEL_KEYS = [
  "prev",
  "current",
  "next",
  "lots",
  "lastSold",
  "auctionDisplay",
  "updatedAt",
  "dataSource",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLegacyLotRow(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    lot: value.lot ?? null,
    title: value.title ?? null,
    price: value.price ?? null,
    status: value.status ?? null,
    editHref: value.editHref ?? value.editUrl ?? null,
  };
}

function normalizeLastSold(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    lot: value.lot ?? null,
    title: value.title ?? null,
    price: value.price ?? null,
    editUrl: value.editUrl ?? value.editHref ?? null,
  };
}

function normalizeLegacyLotRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeLegacyLotRow(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function mergeDefinedStrings(
  manualValue: string | null | undefined,
  fallbackValue: unknown,
): string | null {
  if (typeof manualValue === "string" && manualValue.trim()) {
    return manualValue;
  }
  return typeof fallbackValue === "string" ? fallbackValue : null;
}

function mergeDefinedUnknown<T>(
  manualValue: T | null | undefined,
  fallbackValue: T | null | undefined,
): T | null {
  if (manualValue !== undefined && manualValue !== null) {
    return manualValue;
  }
  return fallbackValue ?? null;
}

function buildLegacyRowFromLocalController(
  localLot: NonNullable<EffectiveDisplayLiveState["currentLot"]>,
  baseRow: Record<string, unknown> | null,
): Record<string, unknown> {
  const price =
    localLot.currentBidLabel ??
    (localLot.currentBid != null ? String(localLot.currentBid) : null) ??
    (typeof baseRow?.price === "string" ? baseRow.price : null);

  return {
    lot: mergeDefinedStrings(localLot.lotNumber, baseRow?.lot),
    title: mergeDefinedStrings(localLot.title, baseRow?.title),
    price,
    status: mergeDefinedStrings(localLot.reserveStatus, baseRow?.status),
    editHref: baseRow?.editHref ?? baseRow?.editUrl ?? null,
  };
}

function mergeAuctionDisplay(
  base: Record<string, unknown> | null,
  local: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!base && !local) {
    return null;
  }

  return {
    ...(base ?? {}),
    ...(local ?? {}),
  };
}

function mergeNextLots(
  baseNext: Record<string, unknown>[],
  localNext: EffectiveDisplayLiveState["nextLots"],
): Record<string, unknown>[] {
  if (localNext && localNext.length > 0) {
    return localNext.map((entry) => ({
      lot: entry.lotNumber ?? "—",
      title: entry.title ?? entry.description ?? "",
      price: "",
      status: null,
      editHref: null,
    }));
  }

  return baseNext;
}

/** Normalizes raw scraper snapshot data into the canonical Broad Arrow contract. */
export function normalizeScraperSnapshot(
  raw: Record<string, unknown> | null | undefined,
): CanonicalProjectData | null {
  if (!raw) {
    return null;
  }

  return {
    prev: normalizeLegacyLotRow(raw.prev),
    current: normalizeLegacyLotRow(raw.current),
    next: normalizeLegacyLotRows(raw.next),
    lots: normalizeLegacyLotRows(raw.lots),
    lastSold: normalizeLastSold(raw.lastSold),
    auctionDisplay: isRecord(raw.auctionDisplay) ? raw.auctionDisplay : null,
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    dataSource: "webpage-scraper",
  };
}

/** Merges scraper metadata with Local Controller overrides into the canonical contract. */
export function normalizeLocalControllerSnapshot(input: {
  scraperBase: CanonicalProjectData | null;
  localControllerState: EffectiveDisplayLiveState | null;
}): CanonicalProjectData {
  const base = input.scraperBase ?? {
    prev: null,
    current: null,
    next: [],
    lots: [],
    lastSold: null,
    auctionDisplay: null,
    updatedAt: new Date().toISOString(),
    dataSource: "local-controller" as const,
  };

  if (!input.localControllerState?.currentLot) {
    return {
      prev: base.prev ?? null,
      current: base.current ?? null,
      next: base.next ?? [],
      lots: base.lots ?? [],
      lastSold: base.lastSold ?? null,
      auctionDisplay: base.auctionDisplay ?? null,
      updatedAt: new Date().toISOString(),
      dataSource: "local-controller",
    };
  }

  const localLot = input.localControllerState.currentLot;
  const current = buildLegacyRowFromLocalController(localLot, base.current ?? null);

  return {
    prev: base.prev ?? null,
    current,
    next: mergeNextLots(base.next ?? [], input.localControllerState.nextLots),
    lots: base.lots ?? [],
    lastSold: base.lastSold ?? null,
    auctionDisplay: mergeAuctionDisplay(
      base.auctionDisplay ?? null,
      input.localControllerState.auctionDisplay,
    ),
    updatedAt: new Date().toISOString(),
    dataSource: "local-controller",
  };
}

export function buildCanonicalProjectSnapshot(input: {
  source: DisplayDataSource;
  scraperSnapshot: Record<string, unknown> | null;
  localControllerState: EffectiveDisplayLiveState | null;
}): CanonicalProjectData | null {
  const scraperBase = normalizeScraperSnapshot(input.scraperSnapshot);

  if (input.source === "webpage-scraper") {
    return scraperBase;
  }

  return normalizeLocalControllerSnapshot({
    scraperBase,
    localControllerState: input.localControllerState,
  });
}

export function serializeCanonicalProjectSnapshot(
  snapshot: CanonicalProjectData | null,
): CanonicalProjectData | null {
  if (!snapshot) {
    return null;
  }

  return {
    prev: snapshot.prev ?? null,
    current: snapshot.current ?? null,
    next: snapshot.next ?? [],
    lots: snapshot.lots ?? [],
    lastSold: snapshot.lastSold ?? null,
    auctionDisplay: snapshot.auctionDisplay ?? null,
    updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
    dataSource: snapshot.dataSource,
  };
}

export function validateCanonicalProjectData(
  value: unknown,
): CanonicalProjectDataValidation {
  if (!isRecord(value)) {
    return { ok: false, issues: ["Canonical snapshot must be an object."] };
  }

  const issues: string[] = [];
  for (const key of Object.keys(value)) {
    if (!CANONICAL_TOP_LEVEL_KEYS.includes(key as (typeof CANONICAL_TOP_LEVEL_KEYS)[number])) {
      issues.push(`Unexpected top-level key: ${key}`);
    }
  }

  for (const key of CANONICAL_TOP_LEVEL_KEYS) {
    if (!(key in value)) {
      issues.push(`Missing top-level key: ${key}`);
    }
  }

  if (!Array.isArray(value.next)) {
    issues.push("next must be an array.");
  }
  if (!Array.isArray(value.lots)) {
    issues.push("lots must be an array.");
  }
  if (
    value.dataSource !== "webpage-scraper" &&
    value.dataSource !== "local-controller"
  ) {
    issues.push("dataSource must be webpage-scraper or local-controller.");
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, data: value as CanonicalProjectData };
}

export function listCanonicalTopLevelKeys(): readonly string[] {
  return CANONICAL_TOP_LEVEL_KEYS;
}
