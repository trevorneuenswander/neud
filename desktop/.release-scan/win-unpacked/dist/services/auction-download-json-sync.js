"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeJsonAtomically = writeJsonAtomically;
exports.readDownloadJson = readDownloadJson;
exports.appendPhotoToDownloadJson = appendPhotoToDownloadJson;
exports.removePhotoFromDownloadJson = removePhotoFromDownloadJson;
exports.getDownloadJsonPathForPackage = getDownloadJsonPathForPackage;
exports.getDownloadSizeForJsonPath = getDownloadSizeForJsonPath;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const auction_data_paths_1 = require("./auction-data-paths");
const auction_download_size_1 = require("./auction-download-size");
function readLotNumber(lot) {
    const raw = lot.lotNumber ?? lot.lot ?? "";
    return raw.replace(/^lot\s+/i, "").trim();
}
function writeJsonAtomically(jsonPath, payload) {
    const tempPath = `${jsonPath}.tmp`;
    fs_1.default.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs_1.default.renameSync(tempPath, jsonPath);
}
function readDownloadJson(jsonPath) {
    try {
        return JSON.parse(fs_1.default.readFileSync(jsonPath, "utf8"));
    }
    catch {
        return null;
    }
}
function appendPhotoToDownloadJson(input) {
    const exportJson = readDownloadJson(input.jsonPath);
    if (!exportJson) {
        throw new Error("Active download JSON is invalid.");
    }
    const lotKey = input.lotNumber.replace(/^lot\s+/i, "").trim();
    const lots = Array.isArray(exportJson.lots) ? [...exportJson.lots] : [];
    let lot = lots.find((entry) => readLotNumber(entry) === lotKey);
    if (!lot) {
        lot = { lotNumber: lotKey, photos: [] };
        lots.push(lot);
    }
    const photos = Array.isArray(lot.photos) ? [...lot.photos] : [];
    photos.push(input.photo);
    lot.photos = photos;
    lot.photoUrls = photos;
    exportJson.lots = lots;
    exportJson.lotCount = lots.length;
    writeJsonAtomically(input.jsonPath, exportJson);
}
function removePhotoFromDownloadJson(input) {
    const exportJson = readDownloadJson(input.jsonPath);
    if (!exportJson || !Array.isArray(exportJson.lots))
        return;
    const lotKey = input.lotNumber.replace(/^lot\s+/i, "").trim();
    exportJson.lots = exportJson.lots.map((lot) => {
        if (readLotNumber(lot) !== lotKey || !Array.isArray(lot.photos)) {
            return lot;
        }
        const photos = lot.photos.filter((photo) => {
            if (typeof photo === "string") {
                return photo !== input.photoUrl;
            }
            return photo.displayUrl !== input.photoUrl && photo.relativePath !== input.photoUrl;
        });
        return { ...lot, photos, photoUrls: photos };
    });
    writeJsonAtomically(input.jsonPath, exportJson);
}
function getDownloadJsonPathForPackage(packageDir) {
    return (0, auction_data_paths_1.resolveAuctionJsonPathInPackage)(packageDir);
}
function getDownloadSizeForJsonPath(jsonPath) {
    return (0, auction_download_size_1.calculateDownloadPackageSizeBytes)(path_1.default.dirname(jsonPath));
}
