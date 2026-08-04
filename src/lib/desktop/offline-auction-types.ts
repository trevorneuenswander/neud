export type OfflineExportResponse =
  | { ok: true; outputPath: string; dataset?: AuctionDatasetDisplayInfo }
  | { ok: false; error: string };

export type OfflineLoadResponse =
  | {
      ok: true;
      dataset?: AuctionDatasetDisplayInfo;
      envelope?: import("@/lib/bag/types").BagLiveStateEnvelope;
      lotCount?: number;
      cancelled?: boolean;
    }
  | { ok: false; error: string; cancelled?: boolean };

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

export type AuctionDatasetDisplayInfo = {
  reference: {
    source: "downloaded" | "loaded" | "live-snapshot" | "none";
    filePath?: string;
    filename?: string;
    loadedAt: string;
    manualOverride?: boolean;
    totalSizeBytes?: number;
    totalSizeFormatted?: string;
  };
  label: string;
  tooltip: string;
  totalSizeBytes?: number;
  totalSizeFormatted?: string;
};

export type LotThumbnailPhoto = {
  url: string;
  alt: string;
};

export type OfflineDownloadSummary = {
  folderPath: string;
  jsonPath: string;
  photosDownloaded: number;
  photosFailed: number;
  totalSizeBytes: number;
  totalSizeFormatted?: string;
  completedAt: string;
  partialPhotoFailure?: boolean;
  reserveSummary?: {
    lotsTotal: number;
    reserveResolved: number;
    reserveUnknown: number;
    reserveFailed: number;
    noReserveLots?: number;
    reserveLots?: number;
  };
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
  };
};
