import fs from "fs";
import path from "path";
import type { OfflineAuctionJsonExport, OfflineAuctionLot, OfflinePhotoReference } from "./offline-auction-types";
import { resolveAuctionJsonPathInPackage } from "./auction-data-paths";
import { calculateDownloadPackageSizeBytes } from "./auction-download-size";

function readLotNumber(lot: OfflineAuctionLot): string {
  const raw = lot.lotNumber ?? lot.lot ?? "";
  return raw.replace(/^lot\s+/i, "").trim();
}

export function writeJsonAtomically(jsonPath: string, payload: unknown): void {
  const tempPath = `${jsonPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, jsonPath);
}

export function readDownloadJson(jsonPath: string): OfflineAuctionJsonExport | null {
  try {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8")) as OfflineAuctionJsonExport;
  } catch {
    return null;
  }
}

export function appendPhotoToDownloadJson(input: {
  jsonPath: string;
  lotNumber: string;
  photo: OfflinePhotoReference;
}): void {
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

export function removePhotoFromDownloadJson(input: {
  jsonPath: string;
  lotNumber: string;
  photoUrl: string;
}): void {
  const exportJson = readDownloadJson(input.jsonPath);
  if (!exportJson || !Array.isArray(exportJson.lots)) return;

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

export function getDownloadJsonPathForPackage(packageDir: string): string | null {
  return resolveAuctionJsonPathInPackage(packageDir);
}

export function getDownloadSizeForJsonPath(jsonPath: string): number {
  return calculateDownloadPackageSizeBytes(path.dirname(jsonPath));
}
