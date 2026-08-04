import type { LotDetailFailure } from "./bag-edit-url-resolution";

export type ComprehensiveExportLotDiagnostic = {
  lotId: string;
  lotNumber: string;
  detailUrlPresent: boolean;
  detailNavigationStarted: boolean;
  detailNavigationStatus: "pending" | "ok" | "failed" | "skipped";
  photoSelectorMatches: number;
  photoUrlsExtracted: number;
  photoContainerFound?: boolean;
  photoDownloadAttempts: number;
  photoFilesWritten: number;
  reserveSelectorMatched: boolean;
  reserveRawValue: string | null;
  reserveNormalizedValue: string | null;
  failureStage: string | null;
  failureMessage: string | null;
};

export type ComprehensiveExportAggregateDiagnostic = {
  operationId: string;
  tableLotsFound: number;
  lotsWithDetailUrl: number;
  lotsQueued?: number;
  lotsWithSourceEditHref?: number;
  lotsWithResolvedEditUrl?: number;
  sampleSourceEditUrls?: string[];
  sampleResolvedEditUrls?: string[];
  detailPagesQueued: number;
  detailNavigationsStarted?: number;
  detailNavigationsSucceeded?: number;
  detailPagesAuthenticated?: number;
  detailPagesParsed?: number;
  detailResultsMerged?: number;
  detailPagesVisited: number;
  detailPagesSucceeded: number;
  detailPagesFailed: number;
  lotsWithPhotoUrls: number;
  photoUrlsFound: number;
  photoRequestsStarted: number;
  photoResponsesReceived: number;
  photoFilesWritten: number;
  photoFilesPresentAfterFinalize: number;
  reserveValuesResolved: number;
  reserveValuesUnknown: number;
  exportedLotsWritten: number;
  exportAbortStateAtStart?: boolean;
  exportAbortStateAfterFailure?: boolean;
  browserConnected?: boolean;
  authenticatedOrigin?: string | null;
  sessionCookieNames?: string[];
  photoDownloaderModule: string | null;
  lotDiagnostics: ComprehensiveExportLotDiagnostic[];
  lotFailures?: LotDetailFailure[];
};

export function createEmptyComprehensiveExportDiagnostic(
  operationId: string,
): ComprehensiveExportAggregateDiagnostic {
  return {
    operationId,
    tableLotsFound: 0,
    lotsWithDetailUrl: 0,
    detailPagesQueued: 0,
    detailPagesVisited: 0,
    detailPagesSucceeded: 0,
    detailPagesFailed: 0,
    lotsWithPhotoUrls: 0,
    photoUrlsFound: 0,
    photoRequestsStarted: 0,
    photoResponsesReceived: 0,
    photoFilesWritten: 0,
    photoFilesPresentAfterFinalize: 0,
    reserveValuesResolved: 0,
    reserveValuesUnknown: 0,
    exportedLotsWritten: 0,
    photoDownloaderModule: null,
    lotDiagnostics: [],
    lotFailures: [],
  };
}
