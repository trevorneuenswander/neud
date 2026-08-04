"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDownloadPhotoDisplayUrl = buildDownloadPhotoDisplayUrl;
exports.resolveDownloadPhotoAssetPath = resolveDownloadPhotoAssetPath;
exports.importManualLotPhotosToDownload = importManualLotPhotosToDownload;
exports.resolveManualPhotoRoot = resolveManualPhotoRoot;
exports.resolveManualPhotoAssetPath = resolveManualPhotoAssetPath;
exports.buildManualPhotoDisplayUrl = buildManualPhotoDisplayUrl;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const auction_photo_storage_1 = require("./auction-photo-storage");
const auction_download_json_sync_1 = require("./auction-download-json-sync");
const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
function buildDownloadPhotoDisplayUrl(packageId, relativePath, origin) {
    const encoded = relativePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `${origin}/api/offline-assets/${encodeURIComponent(packageId)}/${encoded}`;
}
function resolveDownloadPhotoAssetPath(packageDir, relativePath) {
    const normalized = path_1.default
        .normalize(relativePath.replace(/\\/g, "/"))
        .replace(/^(\.\.(\/|\\|$))+/, "");
    if (normalized.startsWith("..") || path_1.default.isAbsolute(normalized)) {
        return null;
    }
    const absolutePath = path_1.default.join(packageDir, normalized);
    const relative = path_1.default.relative(packageDir, absolutePath);
    if (relative.startsWith("..") || path_1.default.isAbsolute(relative)) {
        return null;
    }
    if (!fs_1.default.existsSync(absolutePath) || !fs_1.default.statSync(absolutePath).isFile()) {
        return null;
    }
    return absolutePath;
}
async function importManualLotPhotosToDownload(input) {
    const lotKey = input.lotNumber.replace(/^lot\s+/i, "").trim();
    if (!lotKey) {
        throw new Error("Lot number is required.");
    }
    const imported = [];
    const rejected = [];
    const photos = [];
    for (const sourcePath of input.sourcePaths) {
        const ext = path_1.default.extname(sourcePath).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
            rejected.push(sourcePath);
            continue;
        }
        const stats = fs_1.default.statSync(sourcePath);
        if (stats.size <= 0 || stats.size > MAX_UPLOAD_BYTES) {
            rejected.push(sourcePath);
            continue;
        }
        try {
            const buffer = fs_1.default.readFileSync(sourcePath);
            const photo = await (0, auction_photo_storage_1.saveBufferAsLotJpeg)({
                packageDir: input.packageDir,
                lotNumber: lotKey,
                buffer,
                source: "manual-upload",
                uploadedAt: new Date().toISOString(),
            });
            const displayUrl = input.buildDisplayUrl(photo.relativePath ?? "");
            const persistedPhoto = {
                ...photo,
                displayUrl,
            };
            (0, auction_download_json_sync_1.appendPhotoToDownloadJson)({
                jsonPath: input.jsonPath,
                lotNumber: lotKey,
                photo: persistedPhoto,
            });
            imported.push(displayUrl);
            photos.push(persistedPhoto);
        }
        catch {
            rejected.push(sourcePath);
        }
    }
    return { imported, rejected, photos };
}
/** @deprecated Legacy manual photo root kept for asset resolution of older uploads */
function resolveManualPhotoRoot(paths, projectId) {
    return path_1.default.join(paths.projects, projectId, "manual-photos");
}
function resolveManualPhotoAssetPath(paths, projectId, relativePath) {
    const root = resolveManualPhotoRoot(paths, projectId);
    const normalized = path_1.default
        .normalize(relativePath.replace(/\\/g, "/"))
        .replace(/^(\.\.(\/|\\|$))+/, "");
    if (normalized.startsWith("..") || path_1.default.isAbsolute(normalized)) {
        return null;
    }
    const absolutePath = path_1.default.join(root, normalized);
    const relative = path_1.default.relative(root, absolutePath);
    if (relative.startsWith("..") || path_1.default.isAbsolute(relative)) {
        return null;
    }
    if (!fs_1.default.existsSync(absolutePath) || !fs_1.default.statSync(absolutePath).isFile()) {
        return null;
    }
    return absolutePath;
}
function buildManualPhotoDisplayUrl(projectId, relativePath, origin) {
    const encoded = relativePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `${origin}/api/offline-assets/manual-${encodeURIComponent(projectId)}/${encoded}`;
}
