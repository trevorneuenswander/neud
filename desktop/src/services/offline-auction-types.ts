export const OFFLINE_AUCTION_FORMAT_VERSION = 2;

export type OfflineAuctionManifest = {
  formatVersion: typeof OFFLINE_AUCTION_FORMAT_VERSION;
  exportedAt: string;
  source: "webpage-scraper";
  jsonFileName?: string;
  auction: {
    name: string;
    sourceUrl?: string;
  };
  activeLot?: string;
  lotCount: number;
  imageCount: number;
  failedImages: Array<{
    lot: string;
    url: string;
    reason: string;
  }>;
};

export type OfflinePhotoReference = {
  relativePath?: string;
  displayUrl?: string;
  sourceUrl?: string;
  remoteUrl?: string;
  localPath?: string;
  downloaded?: boolean;
  order?: number;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  source?: "scraped" | "manual-upload" | "legacy";
  uploadedAt?: string;
};

export type OfflineLotEditPageExport = {
  url: string;
  sold: boolean;
  reserveStatus: string;
  reserveDetails: {
    noReserve: boolean;
    reservesOff: boolean;
    reservePriceRaw: string | null;
    reservePrice: number | null;
  };
};

export type OfflineAuctionLot = {
  lot?: string;
  lotNumber?: string;
  title?: string;
  year?: string;
  description?: string;
  price?: string;
  biddingPrice?: string;
  currentBidLabel?: string;
  currentBid?: number;
  reserveStatus?: import("../bag/reserve-status").ReserveStatus | string;
  reserveRawText?: string;
  noReserve?: boolean | null;
  reservesOff?: boolean | null;
  reservePrice?: number | null;
  reservePriceRaw?: string | null;
  status?: string;
  sold?: boolean;
  passed?: boolean;
  currencies?: string[];
  photos?: Array<string | OfflinePhotoReference>;
  photoUrls?: Array<string | OfflinePhotoReference>;
  photoSources?: string[];
  editUrl?: string;
  editHref?: string;
  detailUrl?: string;
  vehicleId?: string;
  imageUrl?: string;
  editPage?: OfflineLotEditPageExport;
};

export type OfflineAuctionPhotoDiscoveryDiagnostics = {
  lotsWithPhotos?: number;
  totalPhotoUrls?: number;
  photoDownloadsQueued?: number;
  photoDownloadsSucceeded?: number;
  photoDownloadsFailed?: number;
  photoFilesWritten?: number;
  photoFilesPresentAfterFinalize?: number;
  lotDiagnostics?: Array<Record<string, unknown>>;
};

export type OfflineAuctionPhotoDiscovery = {
  attempted: number;
  succeeded: number;
  failed: Array<{
    lot: string;
    editUrl: string;
    reason: string;
  }>;
  diagnostics?: OfflineAuctionPhotoDiscoveryDiagnostics;
};

export type OfflineReserveSummary = {
  lotsTotal: number;
  reserveResolved: number;
  reserveUnknown: number;
  reserveFailed: number;
  noReserveLots?: number;
  reserveLots?: number;
};

export type OfflineAuctionJsonExport = {
  formatVersion: typeof OFFLINE_AUCTION_FORMAT_VERSION;
  exportedAt: string;
  downloadedAt?: string;
  source: "webpage-scraper" | "local-controller";
  auction: {
    name: string;
    sourceUrl?: string;
  };
  scrape: {
    scrapedAt?: string;
    sourceUrl?: string;
    activeLot?: string;
    snapshot: Record<string, unknown>;
  };
  activeLot?: string;
  lotCount: number;
  lots: OfflineAuctionLot[];
  photoDiscovery: OfflineAuctionPhotoDiscovery;
  reserveSummary?: OfflineReserveSummary;
  exportDiagnostics?: {
    lotsTotal: number;
    lotsProcessed: number;
    lotsSucceeded: number;
    lotsFailed: number;
    photoUrlsFound: number;
    photosDownloaded: number;
    photosFailed: number;
    lotFailures: Array<{
      lotNumber: string;
      vehicleId: string | null;
      editUrl: string | null;
      stage: string;
      reason: string;
    }>;
  };
  comprehensiveDiagnostics?: import("./comprehensive-export-diagnostics").ComprehensiveExportAggregateDiagnostic;
};

export type OfflineAuctionData = {
  exportedAt: string;
  sourceUrl?: string;
  scrapedAt?: string;
  activeLot?: string;
  prev?: OfflineAuctionLot | null;
  current?: OfflineAuctionLot | null;
  next?: OfflineAuctionLot[] | null;
  lots?: OfflineAuctionLot[] | null;
  lastSold?: OfflineAuctionLot | null;
  auctionDisplay?: OfflineAuctionLot | null;
  updatedAt?: string | null;
};

export type OfflineExportProgress = {
  exportId?: string;
  phase:
    | "idle"
    | "preparing"
    | "loading-scraper-data"
    | "signing-in"
    | "processing-lots"
    | "writing-package"
    | "complete"
    | "error"
    | "scraping-lots"
    | "downloading-photos"
    | "writing-json"
    | "finalizing";
  completed: number;
  total: number;
  percent: number;
  message: string;
  outputPath?: string;
  error?: string;
};

export type OfflineExportSuccess = {
  ok: true;
  outputPath: string;
  export: OfflineAuctionJsonExport;
};

export type OfflineExportFailure = {
  ok: false;
  error: string;
};

export type OfflineExportResult = OfflineExportSuccess | OfflineExportFailure;

export type OfflineLoadResult =
  | { ok: true; packageId?: string; lotCount: number }
  | { ok: false; error: string };

export type OfflineDownloadSummary = {
  folderPath: string;
  jsonPath: string;
  photosDownloaded: number;
  photosFailed: number;
  totalSizeBytes: number;
  totalSizeFormatted?: string;
  completedAt: string;
  partialPhotoFailure?: boolean;
  reserveSummary?: OfflineReserveSummary;
  photoAggregate?: {
    lotsTotal: number;
    lotsWithSourcePhotos: number;
    sourcePhotoUrlsTotal: number;
    normalizedPhotoUrlsTotal: number;
    photoRequestsStarted: number;
    photoResponsesSuccessful: number;
    photoResponsesFailed: number;
    rawFilesWritten: number;
    jpegFilesWritten: number;
    jsonPhotoReferencesWritten: number;
  };
};

export type AuctionDownloadEntry = {
  packageDir: string;
  jsonPath: string;
  filename: string;
  downloadedAt: string;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  lotCount: number;
};

export type ClearDownloadsResult = {
  ok: true;
  foldersRemoved: number;
  filesRemoved: number;
  bytesRemoved: number;
} | { ok: false; error: string };
