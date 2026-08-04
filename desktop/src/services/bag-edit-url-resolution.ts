import type { OfflineAuctionLot } from "./offline-auction-types";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import { BAG_AUCTION_SITE_ORIGIN } from "../bag/default-sources";

export type LotDetailFailureStage =
  | "url-resolution"
  | "page-creation"
  | "navigation"
  | "authentication"
  | "http-status"
  | "redirect"
  | "parse"
  | "merge"
  | "cancelled"
  | "unknown";

export type LotDetailFailure = {
  lotId: string | null;
  lotNumber: string | null;
  sourceEditUrl: string | null;
  resolvedEditUrl: string | null;
  stage: LotDetailFailureStage;
  navigationStatus: number | null;
  finalUrl: string | null;
  pageTitle: string | null;
  loginPageDetected: boolean;
  message: string;
};

export function getVehicleIdFromEditUrl(value: string | null | undefined): string | null {
  const match = String(value ?? "").match(/\/vehicles\/(\d+)\/edit(?:[?#].*)?$/i);
  return match?.[1] ?? null;
}

export function isBlockedAuctionOrigin(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return true;
    }
    const host = parsed.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  } catch {
    return true;
  }
}

export function resolveAuctionOriginFromUrl(auctionUrl: string | null | undefined): string | null {
  if (!auctionUrl?.trim()) return null;
  try {
    const parsed = new URL(auctionUrl.trim());
    if (isBlockedAuctionOrigin(parsed.toString())) {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function resolveLotEditUrlForExport(
  href: string | null | undefined,
  auctionOrigin: string,
): string | null {
  if (!href?.trim()) return null;

  let absolute: string;
  try {
    absolute = new URL(href.trim(), `${auctionOrigin}/`).toString();
  } catch {
    return null;
  }

  if (isBlockedAuctionOrigin(absolute)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    return null;
  }

  const vehicleMatch = parsed.pathname.match(/^\/vehicles\/(\d+)(?:\/edit)?\/?$/i);
  if (!vehicleMatch) {
    return null;
  }

  parsed.pathname = `/vehicles/${vehicleMatch[1]}/edit`;
  return parsed.toString();
}

export function resolveAuctionOriginForExport(input: {
  snapshot: Record<string, unknown>;
  dataSources: DataSourcesRepository;
  engineId: string | null;
}): string {
  const fromSnapshot =
    (typeof input.snapshot.sourceUrl === "string" && input.snapshot.sourceUrl) ||
    (typeof input.snapshot.listingUrl === "string" && input.snapshot.listingUrl) ||
    null;

  const snapshotOrigin = resolveAuctionOriginFromUrl(fromSnapshot);
  if (snapshotOrigin) {
    return snapshotOrigin;
  }

  if (input.engineId) {
    const vehiclesSource = input.dataSources.getSourceByKey(
      input.engineId,
      "vehicles",
    );
    const engineOrigin = resolveAuctionOriginFromUrl(vehiclesSource?.url);
    if (engineOrigin) {
      return engineOrigin;
    }
  }

  return BAG_AUCTION_SITE_ORIGIN;
}

function readLotNumber(lot: OfflineAuctionLot): string {
  const raw = lot.lotNumber ?? lot.lot ?? "";
  return raw.replace(/^lot\s+/i, "").trim();
}

export function buildEditUrlDiagnostics(
  lots: OfflineAuctionLot[],
  auctionOrigin: string,
): {
  lotsTotal: number;
  lotsWithSourceEditHref: number;
  lotsWithResolvedEditUrl: number;
  sampleSourceEditUrls: string[];
  sampleResolvedEditUrls: string[];
} {
  const sampleSourceEditUrls: string[] = [];
  const sampleResolvedEditUrls: string[] = [];
  let lotsWithSourceEditHref = 0;
  let lotsWithResolvedEditUrl = 0;

  for (const lot of lots) {
    const source = lot.editHref ?? lot.editUrl ?? lot.detailUrl ?? null;
    if (source) {
      lotsWithSourceEditHref += 1;
      if (sampleSourceEditUrls.length < 3) {
        sampleSourceEditUrls.push(source);
      }
    }

    const resolved = resolveLotEditUrlForExport(source, auctionOrigin);
    if (resolved) {
      lotsWithResolvedEditUrl += 1;
      lot.editUrl = resolved;
      if (!lot.editHref && source) {
        try {
          lot.editHref = new URL(resolved).pathname;
        } catch {
          lot.editHref = source;
        }
      }
      if (sampleResolvedEditUrls.length < 3) {
        sampleResolvedEditUrls.push(resolved);
      }
    }

    const vehicleId = getVehicleIdFromEditUrl(resolved ?? source);
    if (vehicleId) {
      lot.vehicleId = vehicleId;
    }

    if (!readLotNumber(lot)) {
      continue;
    }
  }

  return {
    lotsTotal: lots.length,
    lotsWithSourceEditHref,
    lotsWithResolvedEditUrl,
    sampleSourceEditUrls,
    sampleResolvedEditUrls,
  };
}

export function formatComprehensiveExportFailureMessage(input: {
  diagnostics?: {
    detailNavigationsSucceeded?: number;
    detailPagesAuthenticated?: number;
    detailPagesParsed?: number;
    detailResultsMerged?: number;
    lotFailures?: LotDetailFailure[];
  };
}): string {
  const failures = input.diagnostics?.lotFailures ?? [];
  const first = failures[0];

  const appendFirstFailure = (message: string): string => {
    if (!first || message.includes("First failure:")) {
      return message;
    }
    return `${message}\n\nFirst failure:\nLot ${first.lotNumber ?? first.lotId ?? "unknown"}\nURL: ${first.resolvedEditUrl ?? first.sourceEditUrl ?? "unknown"}\nStage: ${first.stage}\nReason: ${first.message}`;
  };

  if (
    (input.diagnostics?.detailNavigationsSucceeded ?? 0) === 0 &&
    failures.some((entry) => entry.stage === "url-resolution")
  ) {
    return appendFirstFailure(
      "Comprehensive export could not resolve any Lot Details URLs from the auction table snapshot.",
    );
  }

  if (
    (input.diagnostics?.detailNavigationsSucceeded ?? 0) === 0 &&
    failures.some((entry) => entry.stage === "authentication" || entry.loginPageDetected)
  ) {
    return appendFirstFailure("Lot Details pages redirected to sign-in.");
  }

  if ((input.diagnostics?.detailNavigationsSucceeded ?? 0) === 0) {
    return appendFirstFailure("Comprehensive export could not open any Lot Details pages.");
  }

  if (
    (input.diagnostics?.detailPagesParsed ?? 0) === 0 &&
    (input.diagnostics?.detailNavigationsSucceeded ?? 0) > 0
  ) {
    return appendFirstFailure("Lot Details pages opened, but their fields could not be parsed.");
  }

  if (
    (input.diagnostics?.detailPagesParsed ?? 0) > 0 &&
    (input.diagnostics?.detailResultsMerged ?? 0) === 0
  ) {
    return appendFirstFailure(
      "Lot Details pages were parsed, but their results could not be matched to auction lots.",
    );
  }

  return appendFirstFailure(
    "Comprehensive export failed before any Lot Details pages completed successfully.",
  );
}

export function resolveLotEditUrlFromLot(
  lot: OfflineAuctionLot,
  auctionOrigin: string,
): { editUrl: string | null; vehicleId: string | null } {
  const vehicleId =
    (typeof lot.vehicleId === "string" && lot.vehicleId.trim()) ||
    getVehicleIdFromEditUrl(lot.editUrl) ||
    getVehicleIdFromEditUrl(lot.editHref) ||
    getVehicleIdFromEditUrl(lot.detailUrl) ||
    null;

  const candidates = [
    lot.editUrl,
    lot.editHref,
    lot.detailUrl,
    vehicleId ? `/vehicles/${vehicleId}/edit` : null,
    vehicleId ? `${auctionOrigin}/vehicles/${vehicleId}/edit` : null,
  ];

  for (const candidate of candidates) {
    const resolved = resolveLotEditUrlForExport(candidate, auctionOrigin);
    if (resolved) {
      return {
        editUrl: resolved,
        vehicleId: getVehicleIdFromEditUrl(resolved) ?? vehicleId,
      };
    }
  }

  return { editUrl: null, vehicleId };
}
