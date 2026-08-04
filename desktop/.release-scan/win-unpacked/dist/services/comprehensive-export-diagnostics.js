"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyComprehensiveExportDiagnostic = createEmptyComprehensiveExportDiagnostic;
function createEmptyComprehensiveExportDiagnostic(operationId) {
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
