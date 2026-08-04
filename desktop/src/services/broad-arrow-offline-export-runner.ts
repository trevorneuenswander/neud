import fs from "fs";
import path from "path";
import type { AppPaths } from "./app-paths";
import type { CredentialStore } from "./credential-store";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import type { DownloadPackagePaths } from "./auction-data-paths";
import { finalizeDownloadPackage } from "./auction-data-paths";
import {
  authenticateBroadArrowExportBrowser,
} from "./broad-arrow-export-auth";
import {
  BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE,
  getProjectWebpageScraperCredentials,
} from "./project-scraper-auth";
import {
  downloadExportPhotoBytes,
  sanitizeLotPhotoFolder,
} from "./broad-arrow-export-photo-download";
import {
  deriveBroadArrowReserveStatusLabel,
  readReserveDetailsFromDetail,
} from "./broad-arrow-export-reserve";
import {
  resolveAuctionOriginForExport,
  resolveLotEditUrlFromLot,
} from "./bag-edit-url-resolution";
import {
  assertDataEngineModuleExists,
  resolveBagLotDetailAdapterPath,
  resolveDataEngineDistModule,
} from "./bag-detail-adapter-path";
import { nativeImport } from "./import-esm-module";
import { resolvePuppeteerModule } from "./resolve-puppeteer-module";
import {
  OFFLINE_AUCTION_FORMAT_VERSION,
  type OfflineAuctionJsonExport,
  type OfflineAuctionLot,
  type OfflineExportProgress,
} from "./offline-auction-types";
import { serializeReserveStatusForStorage } from "../bag/reserve-status";

type ExportPuppeteerPage = {
  close: () => Promise<void>;
  url: () => string;
  goto: (
    url: string,
    options?: Record<string, unknown>,
  ) => Promise<{
    ok: () => boolean;
    status: () => number;
    buffer: () => Promise<Buffer>;
    headers: () => Record<string, string>;
  } | null>;
  title: () => Promise<string>;
  evaluate: (fn: () => unknown) => Promise<unknown>;
};

type ExportPuppeteerBrowser = {
  newPage: () => Promise<ExportPuppeteerPage>;
  close: () => Promise<void>;
};

type FetchLotDetailData = (
  page: ExportPuppeteerPage,
  editUrl: string,
  options?: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export type BroadArrowExportLotFailure = {
  lotNumber: string;
  vehicleId: string | null;
  editUrl: string | null;
  stage: string;
  reason: string;
};

export type BroadArrowExportDiagnostics = {
  lotsTotal: number;
  lotsProcessed: number;
  lotsSucceeded: number;
  lotsFailed: number;
  photoUrlsFound: number;
  photosDownloaded: number;
  photosFailed: number;
  lotFailures: BroadArrowExportLotFailure[];
};

export type BroadArrowExportProgressReporter = (
  input: Pick<OfflineExportProgress, "phase" | "message" | "completed" | "total">,
) => void;

function readLotNumber(lot: OfflineAuctionLot | null | undefined): string {
  if (!lot) return "";
  const raw = lot.lotNumber ?? lot.lot ?? "";
  return raw.replace(/^lot\s+/i, "").trim();
}

function cloneLot(lot: OfflineAuctionLot): OfflineAuctionLot {
  return JSON.parse(JSON.stringify(lot)) as OfflineAuctionLot;
}

function dedupePhotoUrls(urls: string[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    ordered.push(url);
  }
  return ordered;
}

function reserveStatusForStorage(label: string): string {
  switch (label) {
    case "No Reserve":
      return serializeReserveStatusForStorage("offered_without_reserve");
    case "Reserve Off":
      return serializeReserveStatusForStorage("unknown");
    case "Reserve":
      return serializeReserveStatusForStorage("has_reserve");
    default:
      return serializeReserveStatusForStorage("unknown");
  }
}

function buildAssetUrl(localApiBaseUrl: string, packageId: string, relativePath: string): string {
  const encoded = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${localApiBaseUrl}/api/offline-assets/${encodeURIComponent(packageId)}/${encoded}`;
}

function removePartialPackage(packageDir: string): void {
  if (fs.existsSync(packageDir)) {
    fs.rmSync(packageDir, { recursive: true, force: true });
  }
}

export async function runBroadArrowOfflineExport(input: {
  paths: AppPaths;
  projectName: string;
  packagePaths: DownloadPackagePaths;
  snapshot: Record<string, unknown>;
  engineId: string;
  credentials: CredentialStore;
  dataSources: DataSourcesRepository;
  localApiBaseUrl: string;
  isCancelled?: () => boolean;
  onProgress: BroadArrowExportProgressReporter;
}): Promise<{
  export: OfflineAuctionJsonExport;
  outputPath: string;
  finalPackageDir: string;
  diagnostics: BroadArrowExportDiagnostics;
}> {
  const isCancelled = input.isCancelled ?? (() => false);
  const exportedAt = new Date().toISOString();
  const sourceLots = Array.isArray(input.snapshot.lots)
    ? (input.snapshot.lots as OfflineAuctionLot[])
    : [];
  const exportLots = sourceLots.map(cloneLot);
  const auctionOrigin = resolveAuctionOriginForExport({
    snapshot: input.snapshot,
    dataSources: input.dataSources,
    engineId: input.engineId,
  });

  const diagnostics: BroadArrowExportDiagnostics = {
    lotsTotal: exportLots.length,
    lotsProcessed: 0,
    lotsSucceeded: 0,
    lotsFailed: 0,
    photoUrlsFound: 0,
    photosDownloaded: 0,
    photosFailed: 0,
    lotFailures: [],
  };

  const activeLot =
    readLotNumber(input.snapshot.current as OfflineAuctionLot | undefined) ||
    readLotNumber(input.snapshot.auctionDisplay as OfflineAuctionLot | undefined);

  const scrapedAt =
    typeof (input.snapshot.auctionDisplay as Record<string, unknown> | undefined)?.scrapedAt ===
    "string"
      ? ((input.snapshot.auctionDisplay as Record<string, unknown>).scrapedAt as string)
      : typeof input.snapshot.updatedAt === "string"
        ? input.snapshot.updatedAt
        : exportedAt;

  input.onProgress({
    phase: "preparing",
    message: "Preparing export…",
    completed: 0,
    total: exportLots.length,
  });

  if (!getProjectWebpageScraperCredentials(input.credentials, input.engineId)) {
    throw new Error(BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE);
  }

  input.onProgress({
    phase: "loading-scraper-data",
    message: `Loaded ${exportLots.length} lots from Webpage Scraper snapshot.`,
    completed: 0,
    total: exportLots.length,
  });

  const lotDetailAdapter = resolveBagLotDetailAdapterPath(input.paths);
  assertDataEngineModuleExists(lotDetailAdapter);
  const lotDetailModule = await nativeImport<{ fetchLotDetailData: FetchLotDetailData }>(
    lotDetailAdapter.moduleUrl,
  );

  const browserUserDataDir = path.join(input.paths.browserData, input.engineId);
  fs.mkdirSync(browserUserDataDir, { recursive: true });
  fs.mkdirSync(input.paths.cookies, { recursive: true });
  process.env.NEUD_APP_DATA_DIR = input.paths.root;
  process.env.NEUD_BROWSER_USER_DATA_DIR = browserUserDataDir;
  process.env.NEUD_COOKIES_DIR = input.paths.cookies;
  process.env.ENGINE_ID = input.engineId;

  const { puppeteer, resolvedBrowser, buildPuppeteerLaunchOptions } =
    await resolvePuppeteerModule(input.paths, lotDetailAdapter.workerRoot);

  const launchOptions = buildPuppeteerLaunchOptions(resolvedBrowser, {
    headless: true,
    userDataDir: browserUserDataDir,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  let browser: ExportPuppeteerBrowser | null = null;
  let detailPage: ExportPuppeteerPage | null = null;
  let photoPage: ExportPuppeteerPage | null = null;
  const packageDir = input.packagePaths.packageDir;
  const lotFolderCounts = new Map<string, number>();

  try {
    browser = (await puppeteer.launch(launchOptions)) as ExportPuppeteerBrowser;
    detailPage = await browser.newPage();

    input.onProgress({
      phase: "signing-in",
      message: "Signing in to auction website…",
      completed: 0,
      total: exportLots.length,
    });

    await authenticateBroadArrowExportBrowser({
      paths: input.paths,
      engineId: input.engineId,
      page: detailPage,
      credentials: input.credentials,
      dataSources: input.dataSources,
    });

    photoPage = await browser.newPage();

    for (let index = 0; index < exportLots.length; index += 1) {
      if (isCancelled()) {
        throw new Error("Export cancelled.");
      }

      const lot = exportLots[index];
      const lotNumber = readLotNumber(lot);
      const { editUrl, vehicleId } = resolveLotEditUrlFromLot(lot, auctionOrigin);
      diagnostics.lotsProcessed += 1;

      input.onProgress({
        phase: "processing-lots",
        message: `Processing lot ${index + 1} of ${exportLots.length}${lotNumber ? `: Lot ${lotNumber}` : ""}`,
        completed: index,
        total: exportLots.length,
      });

      if (!lotNumber) {
        diagnostics.lotsFailed += 1;
        diagnostics.lotFailures.push({
          lotNumber: "",
          vehicleId,
          editUrl,
          stage: "url-resolution",
          reason: "Lot number is missing.",
        });
        continue;
      }

      if (!editUrl) {
        diagnostics.lotsFailed += 1;
        diagnostics.lotFailures.push({
          lotNumber,
          vehicleId,
          editUrl: null,
          stage: "url-resolution",
          reason: "Could not resolve a valid Edit URL.",
        });
        continue;
      }

      lot.editUrl = editUrl;
      if (vehicleId) {
        lot.vehicleId = vehicleId;
      }

      try {
        const detail = await lotDetailModule.fetchLotDetailData(detailPage, editUrl, {
          auctionUrl: auctionOrigin,
          timeout: 45000,
          shouldAbort: isCancelled,
          login: async () => {
            await authenticateBroadArrowExportBrowser({
              paths: input.paths,
              engineId: input.engineId,
              page: detailPage!,
              credentials: input.credentials,
              dataSources: input.dataSources,
            });
          },
        });

        const reserveDetails = readReserveDetailsFromDetail(detail);
        const reserveStatusLabel = deriveBroadArrowReserveStatusLabel(reserveDetails);
        lot.sold = detail.sold === true;
        lot.reserveStatus = reserveStatusForStorage(reserveStatusLabel);
        lot.editPage = {
          url: editUrl,
          sold: detail.sold === true,
          reserveStatus: reserveStatusLabel,
          reserveDetails,
        };

        const photoUrls = dedupePhotoUrls(
          Array.isArray(detail.photoUrls)
            ? detail.photoUrls.filter((url): url is string => typeof url === "string")
            : [],
        );
        diagnostics.photoUrlsFound += photoUrls.length;

        const folderKey = sanitizeLotPhotoFolder(lotNumber);
        const folderUseCount = (lotFolderCounts.get(folderKey) ?? 0) + 1;
        lotFolderCounts.set(folderKey, folderUseCount);
        const lotFolder =
          folderUseCount > 1 && vehicleId
            ? `${folderKey}-vehicle-${vehicleId}`
            : folderKey;

        const exportedPhotos: OfflineAuctionLot["photos"] = [];

        for (let photoIndex = 0; photoIndex < photoUrls.length; photoIndex += 1) {
          if (isCancelled()) {
            throw new Error("Export cancelled.");
          }

          const photoUrl = photoUrls[photoIndex];
          input.onProgress({
            phase: "processing-lots",
            message: `Downloading photo ${photoIndex + 1} of ${photoUrls.length} for Lot ${lotNumber}`,
            completed: index,
            total: exportLots.length,
          });

          const sequence = String(photoIndex + 1).padStart(2, "0");
          const relativeStem = path.posix.join("photos", lotFolder, sequence);
          const absoluteStem = path.join(packageDir, relativeStem);

          try {
            const downloaded = await downloadExportPhotoBytes({
              photoUrl,
              destinationPath: absoluteStem,
              page: photoPage,
            });
            const relativePath = path
              .relative(packageDir, downloaded.finalPath)
              .replace(/\\/g, "/");
            diagnostics.photosDownloaded += 1;
            exportedPhotos.push({
              order: photoIndex + 1,
              remoteUrl: photoUrl,
              localPath: relativePath,
              downloaded: true,
              relativePath,
              sourceUrl: photoUrl,
            });
          } catch (error) {
            diagnostics.photosFailed += 1;
            exportedPhotos.push({
              order: photoIndex + 1,
              remoteUrl: photoUrl,
              localPath: "",
              downloaded: false,
              sourceUrl: photoUrl,
            });
            diagnostics.lotFailures.push({
              lotNumber,
              vehicleId,
              editUrl,
              stage: "photo-download",
              reason: error instanceof Error ? error.message : "Photo download failed.",
            });
          }
        }

        const packageId = path.basename(packageDir).replace(/\.partial$/i, "");
        lot.photos = exportedPhotos.map((photo) => {
          if (typeof photo === "string") return photo;
          if (photo.relativePath) {
            return {
              ...photo,
              displayUrl: buildAssetUrl(input.localApiBaseUrl, packageId, photo.relativePath),
            };
          }
          return photo;
        });
        lot.photoUrls = photoUrls;

        diagnostics.lotsSucceeded += 1;
      } catch (error) {
        diagnostics.lotsFailed += 1;
        const stage =
          error instanceof Error && "stage" in error
            ? String((error as { stage?: string }).stage ?? "unknown")
            : "unknown";
        diagnostics.lotFailures.push({
          lotNumber,
          vehicleId,
          editUrl,
          stage,
          reason: error instanceof Error ? error.message : "Lot export failed.",
        });
      }
    }

    input.onProgress({
      phase: "writing-package",
      message: "Writing package…",
      completed: exportLots.length,
      total: exportLots.length,
    });

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
        attempted: diagnostics.lotsTotal,
        succeeded: diagnostics.lotsSucceeded,
        failed: diagnostics.lotFailures.map((failure) => ({
          lot: failure.lotNumber,
          editUrl: failure.editUrl ?? "",
          reason: `[${failure.stage}] ${failure.reason}`,
        })),
        diagnostics: {
          lotsWithPhotos: exportLots.filter((lot) =>
            Array.isArray(lot.photos) ? lot.photos.some((photo) => typeof photo !== "string" && photo.downloaded) : false,
          ).length,
          totalPhotoUrls: diagnostics.photoUrlsFound,
          photoDownloadsQueued: diagnostics.photoUrlsFound,
          photoDownloadsSucceeded: diagnostics.photosDownloaded,
          photoDownloadsFailed: diagnostics.photosFailed,
          photoFilesWritten: diagnostics.photosDownloaded,
          photoFilesPresentAfterFinalize: diagnostics.photosDownloaded,
        },
      },
      exportDiagnostics: diagnostics,
    };

    fs.writeFileSync(input.packagePaths.jsonPath, JSON.stringify(exportPayload, null, 2), "utf8");

    const finalPackageDir = finalizeDownloadPackage(packageDir);
    const outputPath = path.join(finalPackageDir, "auction-data.json");

    return {
      export: exportPayload,
      outputPath,
      finalPackageDir,
      diagnostics,
    };
  } catch (error) {
    removePartialPackage(packageDir);
    throw error;
  } finally {
    await photoPage?.close().catch(() => {});
    await detailPage?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}
