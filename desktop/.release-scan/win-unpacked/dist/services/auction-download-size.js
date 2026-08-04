"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDownloadSize = formatDownloadSize;
exports.calculateDirectorySizeBytes = calculateDirectorySizeBytes;
exports.calculateDownloadPackageSizeBytes = calculateDownloadPackageSizeBytes;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const auction_data_paths_1 = require("./auction-data-paths");
const SIZE_UNITS = ["B", "KB", "MB", "GB"];
function formatDownloadSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "0 B";
    }
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    const precision = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(precision)} ${SIZE_UNITS[unitIndex]}`;
}
function shouldIncludeInDownloadSize(relativePath) {
    const normalized = relativePath.replace(/\\/g, "/");
    const baseName = path_1.default.posix.basename(normalized);
    if (baseName === auction_data_paths_1.DOWNLOAD_COMPLETE_MARKER) {
        return true;
    }
    if (normalized.endsWith(".json") || normalized.includes("/photos/") || normalized.startsWith("photos/")) {
        return true;
    }
    if (normalized.endsWith(".json.tmp")) {
        return false;
    }
    return false;
}
function calculateDirectorySizeBytes(rootDir) {
    if (!fs_1.default.existsSync(rootDir))
        return 0;
    let total = 0;
    const stack = [rootDir];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current)
            continue;
        for (const entry of fs_1.default.readdirSync(current, { withFileTypes: true })) {
            const absolutePath = path_1.default.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(absolutePath);
                continue;
            }
            const relative = path_1.default.relative(rootDir, absolutePath);
            if (!shouldIncludeInDownloadSize(relative)) {
                continue;
            }
            total += fs_1.default.statSync(absolutePath).size;
        }
    }
    return total;
}
function calculateDownloadPackageSizeBytes(packageDir) {
    const jsonPath = (0, auction_data_paths_1.resolveAuctionJsonPathInPackage)(packageDir);
    if (!jsonPath) {
        return 0;
    }
    return calculateDirectorySizeBytes(packageDir);
}
