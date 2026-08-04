import fs from "fs";
import path from "path";
import type { AppPaths } from "./app-paths";
import type { OfflinePhotoReference } from "./offline-auction-types";
import { saveBufferAsLotJpeg } from "./auction-photo-storage";
import { appendPhotoToDownloadJson } from "./auction-download-json-sync";

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function buildDownloadPhotoDisplayUrl(
  packageId: string,
  relativePath: string,
  origin: string,
): string {
  const encoded = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${origin}/api/offline-assets/${encodeURIComponent(packageId)}/${encoded}`;
}

export function resolveDownloadPhotoAssetPath(
  packageDir: string,
  relativePath: string,
): string | null {
  const normalized = path
    .normalize(relativePath.replace(/\\/g, "/"))
    .replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return null;
  }
  const absolutePath = path.join(packageDir, normalized);
  const relative = path.relative(packageDir, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return null;
  }
  return absolutePath;
}

export async function importManualLotPhotosToDownload(input: {
  packageDir: string;
  jsonPath: string;
  lotNumber: string;
  sourcePaths: string[];
  buildDisplayUrl: (relativePath: string) => string;
}): Promise<{ imported: string[]; rejected: string[]; photos: OfflinePhotoReference[] }> {
  const lotKey = input.lotNumber.replace(/^lot\s+/i, "").trim();
  if (!lotKey) {
    throw new Error("Lot number is required.");
  }

  const imported: string[] = [];
  const rejected: string[] = [];
  const photos: OfflinePhotoReference[] = [];

  for (const sourcePath of input.sourcePaths) {
    const ext = path.extname(sourcePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      rejected.push(sourcePath);
      continue;
    }

    const stats = fs.statSync(sourcePath);
    if (stats.size <= 0 || stats.size > MAX_UPLOAD_BYTES) {
      rejected.push(sourcePath);
      continue;
    }

    try {
      const buffer = fs.readFileSync(sourcePath);
      const photo = await saveBufferAsLotJpeg({
        packageDir: input.packageDir,
        lotNumber: lotKey,
        buffer,
        source: "manual-upload",
        uploadedAt: new Date().toISOString(),
      });
      const displayUrl = input.buildDisplayUrl(photo.relativePath ?? "");
      const persistedPhoto: OfflinePhotoReference = {
        ...photo,
        displayUrl,
      };
      appendPhotoToDownloadJson({
        jsonPath: input.jsonPath,
        lotNumber: lotKey,
        photo: persistedPhoto,
      });
      imported.push(displayUrl);
      photos.push(persistedPhoto);
    } catch {
      rejected.push(sourcePath);
    }
  }

  return { imported, rejected, photos };
}

/** @deprecated Legacy manual photo root kept for asset resolution of older uploads */
export function resolveManualPhotoRoot(paths: AppPaths, projectId: string): string {
  return path.join(paths.projects, projectId, "manual-photos");
}

export function resolveManualPhotoAssetPath(
  paths: AppPaths,
  projectId: string,
  relativePath: string,
): string | null {
  const root = resolveManualPhotoRoot(paths, projectId);
  const normalized = path
    .normalize(relativePath.replace(/\\/g, "/"))
    .replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return null;
  }
  const absolutePath = path.join(root, normalized);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return null;
  }
  return absolutePath;
}

export function buildManualPhotoDisplayUrl(
  projectId: string,
  relativePath: string,
  origin: string,
): string {
  const encoded = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${origin}/api/offline-assets/manual-${encodeURIComponent(projectId)}/${encoded}`;
}
