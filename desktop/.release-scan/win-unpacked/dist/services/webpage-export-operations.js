"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isActiveWebpageExportStatus = isActiveWebpageExportStatus;
exports.operationToProgressEvent = operationToProgressEvent;
function isActiveWebpageExportStatus(status) {
    return (status === "queued" ||
        status === "preparing" ||
        status === "running" ||
        status === "cancelling");
}
function operationToProgressEvent(operation) {
    return {
        exportId: operation.operationId,
        operationId: operation.operationId,
        projectId: operation.projectId,
        projectSlug: operation.projectSlug,
        status: operation.status,
        phase: operation.phase,
        percent: operation.percent,
        message: operation.message,
        completed: operation.completedLots,
        total: operation.totalLots,
        completedUnits: operation.completedUnits,
        totalUnits: operation.totalUnits,
        currentLotNumber: operation.currentLotNumber,
        currentPhotoIndex: operation.currentPhotoIndex,
        currentPhotoTotal: operation.currentPhotoTotal,
        outputPath: operation.outputPath,
        error: operation.error,
    };
}
