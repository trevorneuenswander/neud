import path from "path";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import {
  OFFLINE_AUCTION_FORMAT_VERSION,
  type OfflineAuctionJsonExport,
  type OfflineAuctionLot,
} from "./offline-auction-types";
import { resolveAuctionOriginForExport, resolveLotEditUrlFromLot } from "./bag-edit-url-resolution";
import { mapWorkerPhotoReferences } from "./auction-photo-storage";
import { resolveReserveStatusDisplayLabel } from "../bag/reserve-status";
import type { DownloadPackagePaths } from "./auction-data-paths";

export const WORKER_EXPORT_ERRORS = {
  SCRAPER_STOPPED: "Start the Webpage Scraper before downloading the Current Webpage.",
  NO_SNAPSHOT:
    "No Webpage Scraper data is available yet. Start the scraper and wait for a successful poll before downloading.",
  WORKER_MISSING:
    "The active Webpage Scraper worker could not be found. Restart the scraper and try again.",
  BROWSER_DISCONNECTED:
    "The Webpage Scraper browser disconnected. Restart the scraper and try again.",
  AUTH_LOST:
    "The running Webpage Scraper is no longer authenticated. Restart the scraper and try again.",
} as const;

type WorkerLotDetail = {
  sold?: boolean;
  noReserve?: boolean;
  reservesOff?: boolean;
  reservePrice?: number | null;
  reservePriceRaw?: string | null;
  reserveStatus?: string;
  photoUrls?: string[];
  photos?: Array<{ relativePath: string; sourceUrl?: string }>;
  resolvedEditUrl?: string;
  detailUrl?: string;
  vehicleId?: string;
};

export type WorkerExportResult = {
  attempted?: number;
  succeeded?: number;
  failed?: Array<{ lot: string; editUrl: string; reason: string }>;
  detailsByLot?: Record<string, WorkerLotDetail>;
  photoDownloads?: {
    attempted?: number;
    succeeded?: number;
    failed?: Array<{ lot?: string; url?: string; reason: string }>;
  };
  cancelled?: boolean;
  comprehensiveDiagnostics?: Record<string, unknown>;
};

function readLotNumber(lot: OfflineAuctionLot | null | undefined): string {
  if (!lot) return "";
  const raw = lot.lotNumber ?? lot.lot ?? "";
  return raw.replace(/^lot\s+/i, "").trim();
}

function cloneLot(lot: OfflineAuctionLot): OfflineAuctionLot {
  return JSON.parse(JSON.stringify(lot)) as OfflineAuctionLot;
}

function buildAssetUrl(localApiBaseUrl: string, packageId: string, relativePath: string): string {
  const encoded = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${localApiBaseUrl}/api/offline-assets/${encodeURIComponent(packageId)}/${encoded}`;
}

export function buildWorkerExportTasks(
  snapshot: Record<string, unknown>,
  dataSources: DataSourcesRepository,
  engineId: string,
): Array<{ lotNumber: string; editUrl: string; sourceEditUrl?: string | null }> {
  const auctionOrigin = resolveAuctionOriginForExport({ snapshot, dataSources, engineId });
  const lots = Array.isArray(snapshot.lots) ? (snapshot.lots as OfflineAuctionLot[]) : [];

  return lots
    .map((lot) => {
      const lotNumber = readLotNumber(lot);
      const { editUrl } = resolveLotEditUrlFromLot(lot, auctionOrigin);
      const sourceEditUrl =
        (typeof lot.editHref === "string" && lot.editHref) ||
        (typeof lot.editUrl === "string" && lot.editUrl) ||
        editUrl;
      return {
        lotNumber,
        editUrl: editUrl ?? "",
        sourceEditUrl,
      };
    })
    .filter((task) => task.lotNumber && task.editUrl);
}

export function mergeWorkerExportIntoExportPayload(input: {
  snapshot: Record<string, unknown>;
  projectName: string;
  packagePaths: DownloadPackagePaths;
  packageDir: string;
  localApiBaseUrl: string;
  workerResult: WorkerExportResult;
}): {
  export: OfflineAuctionJsonExport;
  diagnostics: {
    lotsTotal: number;
    lotsSucceeded: number;
    lotsFailed: number;
    photoUrlsFound: number;
    photosDownloaded: number;
    photosFailed: number;
  };
} {
  const exportedAt = new Date().toISOString();
  const sourceLots = Array.isArray(input.snapshot.lots)
    ? (input.snapshot.lots as OfflineAuctionLot[])
    : [];
  const exportLots = sourceLots.map(cloneLot);
  const detailsByLot = input.workerResult.detailsByLot ?? {};
  const packageId = path.basename(input.packageDir).replace(/\.partial$/i, "");

  let photosDownloaded = 0;
  let photosFailed = input.workerResult.photoDownloads?.failed?.length ?? 0;
  let photoUrlsFound = 0;
  let lotsSucceeded = 0;

  for (const lot of exportLots) {
    const lotNumber = readLotNumber(lot);
    const detail = detailsByLot[lotNumber];
    if (!detail) {
      continue;
    }

    lotsSucceeded += 1;
    lot.sold = detail.sold === true;
    if (detail.reserveStatus) {
      lot.reserveStatus = detail.reserveStatus;
    }
    const reserveLabel = resolveReserveStatusDisplayLabel(detail.reserveStatus);
    lot.editPage = {
      url: detail.resolvedEditUrl ?? detail.detailUrl ?? lot.editUrl ?? "",
      sold: detail.sold === true,
      reserveStatus: reserveLabel || detail.reserveStatus || "Unknown",
      reserveDetails: {
        noReserve: detail.noReserve === true,
        reservesOff: detail.reservesOff === true,
        reservePriceRaw: detail.reservePriceRaw ?? null,
        reservePrice: detail.reservePrice ?? null,
      },
    };

    const photoUrls = Array.isArray(detail.photoUrls) ? detail.photoUrls : [];
    photoUrlsFound += photoUrls.length;
    lot.photoUrls = photoUrls;

    const workerPhotos = Array.isArray(detail.photos) ? detail.photos : [];
    const mapped = mapWorkerPhotoReferences({
      packageDir: input.packageDir,
      photos: workerPhotos,
    });
    photosDownloaded += mapped.photos.length;
    photosFailed += mapped.failed.length;

    lot.photos = mapped.photos.map((photo, index) => ({
      order: index + 1,
      remoteUrl: photo.sourceUrl ?? workerPhotos[index]?.sourceUrl ?? photoUrls[index],
      localPath: photo.relativePath ?? "",
      downloaded: Boolean(photo.relativePath),
      relativePath: photo.relativePath,
      sourceUrl: photo.sourceUrl,
      displayUrl: photo.relativePath
        ? buildAssetUrl(input.localApiBaseUrl, packageId, photo.relativePath)
        : undefined,
    }));
  }

  const failedLots = input.workerResult.failed ?? [];
  const lotsFailed = Math.max(exportLots.length - lotsSucceeded, failedLots.length);

  const activeLot =
    readLotNumber((input.snapshot.current ?? undefined) as OfflineAuctionLot | undefined) ||
    readLotNumber((input.snapshot.auctionDisplay ?? undefined) as OfflineAuctionLot | undefined);

  const scrapedAt =
    typeof (input.snapshot.auctionDisplay as Record<string, unknown> | undefined)?.scrapedAt ===
    "string"
      ? ((input.snapshot.auctionDisplay as Record<string, unknown>).scrapedAt as string)
      : typeof input.snapshot.updatedAt === "string"
        ? input.snapshot.updatedAt
        : exportedAt;

  const exportPayload: OfflineAuctionJsonExport = {
    formatVersion: OFFLINE_AUCTION_FORMAT_VERSION,
    exportedAt,
    source: "webpage-scraper",
    auction: {
      name: input.projectName,
      sourceUrl:
        typeof input.snapshot.sourceUrl === "string" ? input.snapshot.sourceUrl : undefined,
    },
    scrape: {
      scrapedAt,
      sourceUrl:
        typeof input.snapshot.sourceUrl === "string" ? input.snapshot.sourceUrl : undefined,
      activeLot: activeLot || undefined,
      snapshot: input.snapshot,
    },
    activeLot: activeLot || undefined,
    lotCount: exportLots.length,
    lots: exportLots,
    photoDiscovery: {
      attempted: exportLots.length,
      succeeded: lotsSucceeded,
      failed: failedLots.map((failure) => ({
        lot: failure.lot,
        editUrl: failure.editUrl,
        reason: failure.reason,
      })),
      diagnostics: {
        lotsWithPhotos: exportLots.filter((lot) =>
          Array.isArray(lot.photos)
            ? lot.photos.some(
                (photo) => typeof photo !== "string" && photo.downloaded === true,
              )
            : false,
        ).length,
        totalPhotoUrls: photoUrlsFound,
        photoDownloadsQueued: photoUrlsFound,
        photoDownloadsSucceeded: photosDownloaded,
        photoDownloadsFailed: photosFailed,
        photoFilesWritten: photosDownloaded,
        photoFilesPresentAfterFinalize: photosDownloaded,
      },
    },
    exportDiagnostics: {
      lotsTotal: exportLots.length,
      lotsProcessed: exportLots.length,
      lotsSucceeded,
      lotsFailed,
      photoUrlsFound,
      photosDownloaded,
      photosFailed,
      lotFailures: failedLots.map((failure) => ({
        lotNumber: failure.lot,
        vehicleId: null,
        editUrl: failure.editUrl,
        stage: "worker-export",
        reason: failure.reason,
      })),
    },
    comprehensiveDiagnostics: input.workerResult.comprehensiveDiagnostics as
      | OfflineAuctionJsonExport["comprehensiveDiagnostics"]
      | undefined,
  };

  return {
    export: exportPayload,
    diagnostics: {
      lotsTotal: exportLots.length,
      lotsSucceeded,
      lotsFailed,
      photoUrlsFound,
      photosDownloaded,
      photosFailed,
    },
  };
}

export function mapWorkerExportError(
  error: unknown,
  context: { engineManagerAttached: boolean; engineRunning: boolean },
): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/sign_in|no longer authenticated|login page|not authenticated/i.test(message)) {
    return WORKER_EXPORT_ERRORS.AUTH_LOST;
  }
  if (/browser disconnected|browser session is unavailable|browser is not connected/i.test(message)) {
    return context.engineRunning
      ? WORKER_EXPORT_ERRORS.BROWSER_DISCONNECTED
      : WORKER_EXPORT_ERRORS.SCRAPER_STOPPED;
  }
  if (!context.engineManagerAttached) {
    return WORKER_EXPORT_ERRORS.WORKER_MISSING;
  }
  if (!context.engineRunning) {
    return WORKER_EXPORT_ERRORS.SCRAPER_STOPPED;
  }
  if (/worker could not be found|engine manager is not attached/i.test(message)) {
    return WORKER_EXPORT_ERRORS.WORKER_MISSING;
  }
  return message;
}
