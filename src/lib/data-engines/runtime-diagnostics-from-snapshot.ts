import type { BagSnapshotData } from "@/lib/data-engines/types";
import type { ScrapeRunMetadata } from "@/lib/data-engines/bag-diagnostic-log";

function cleanLot(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return value.trim();
}

export function buildRuntimeDiagnosticsFromSnapshot(
  snapshot: BagSnapshotData | Record<string, unknown> | null | undefined,
): Partial<ScrapeRunMetadata> {
  if (!snapshot || typeof snapshot !== "object") {
    return {};
  }

  const data = snapshot as BagSnapshotData;
  const nextLots = Array.isArray(data.next)
    ? data.next
        .map((row) => cleanLot(row?.lot))
        .filter((lot): lot is string => Boolean(lot))
    : [];

  return {
    currentActiveLot:
      cleanLot(data.current?.lot) ?? cleanLot(data.auctionDisplay?.lot) ?? null,
    previousLot: cleanLot(data.prev?.lot) ?? null,
    nextLots,
    lastSoldLot: cleanLot(data.lastSold?.lot) ?? null,
    listingRowCount: Array.isArray(data.lots) ? data.lots.length : null,
  };
}

export function findLatestLiveDiagnosticsLog(
  logs: Array<{ event_type?: string; metadata?: unknown }>,
) {
  return logs.find((log) => log.event_type === "scrape.live_update");
}

function normLot(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  const numeric = value.replace(/^lot\s+/i, "").match(/\d+/);
  return numeric ? numeric[0] : value.trim().toLowerCase();
}

function lotsEqual(
  a: string[] | null | undefined,
  b: string[] | null | undefined,
): boolean {
  const left = (a ?? []).map((entry) => normLot(entry)).filter(Boolean);
  const right = (b ?? []).map((entry) => normLot(entry)).filter(Boolean);
  if (left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => entry === right[index]);
}

export function buildStateConsistencyDiagnostics(
  snapshot: BagSnapshotData | Record<string, unknown> | null | undefined,
  runtimeMetadata: Partial<ScrapeRunMetadata> | null | undefined,
) {
  const canonical = buildRuntimeDiagnosticsFromSnapshot(snapshot);
  const runtime = runtimeMetadata ?? {};

  const pairs: Array<[string, string | null | undefined, string | null | undefined]> = [
    ["currentLot", runtime.currentActiveLot, canonical.currentActiveLot ?? null],
    ["previousLot", runtime.previousLot, canonical.previousLot ?? null],
    ["lastSold", runtime.lastSoldLot, canonical.lastSoldLot ?? null],
  ];

  for (const [stage, runtimeValue, canonicalValue] of pairs) {
    if (normLot(runtimeValue ?? null) !== normLot(canonicalValue ?? null)) {
      return {
        allStateViewsAgree: false,
        firstStateDivergenceStage: `runtimeDiagnostics_${stage}_vs_canonical`,
      };
    }
  }

  if (!lotsEqual(runtime.nextLots, canonical.nextLots ?? undefined)) {
    return {
      allStateViewsAgree: false,
      firstStateDivergenceStage: "runtimeDiagnostics_nextLots_vs_canonical",
    };
  }

  return {
    allStateViewsAgree: true,
    firstStateDivergenceStage: "none",
  };
}

export function buildCurrentLotPhotoDiagnostics(
  snapshot: BagSnapshotData | Record<string, unknown> | null | undefined,
) {
  const data = snapshot as BagSnapshotData | null;
  const lotNumber =
    cleanLot(data?.current?.lot) ?? cleanLot(data?.auctionDisplay?.lot) ?? null;
  const canonicalPhotos = Array.isArray(data?.auctionDisplay?.photos)
    ? data.auctionDisplay.photos.filter(Boolean)
    : [];
  const canonicalPhotoCount = canonicalPhotos.length;

  return {
    lotNumber,
    cachedPhotoCount: canonicalPhotoCount,
    downloadedPhotoCount: canonicalPhotoCount,
    canonicalPhotoCount,
    displayPayloadPhotoCount: null as number | null,
    firstPhotoFailureStage:
      canonicalPhotoCount > 0 ? ("none" as const) : ("canonicalPhotoCountZero" as const),
  };
}
