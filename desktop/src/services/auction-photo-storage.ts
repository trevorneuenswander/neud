import fs from "fs";
import path from "path";
import type { OfflinePhotoReference } from "./offline-auction-types";
import { convertImageBufferToJpeg, validateJpegBuffer } from "./image-jpeg-conversion";

export function sanitizeLotNumberForFilename(lotNumber: string): string {
  const normalized = lotNumber.replace(/^lot\s+/i, "").trim();
  const sanitized = normalized.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
  return sanitized.replace(/^-+|-+$/g, "") || "unknown";
}

export function buildLotPhotoFileName(lotNumber: string, sequence: number): string {
  const lotKey = sanitizeLotNumberForFilename(lotNumber);
  return `lot-${lotKey}_${String(sequence).padStart(2, "0")}.jpg`;
}

export function resolveNextPhotoSequence(photosDir: string, lotNumber: string): number {
  if (!fs.existsSync(photosDir)) return 1;
  const prefix = `lot-${sanitizeLotNumberForFilename(lotNumber)}_`;
  const sequences = fs
    .readdirSync(photosDir)
    .filter((name) => name.startsWith(prefix) && name.toLowerCase().endsWith(".jpg"))
    .map((name) => Number(name.slice(prefix.length, -4)))
    .filter((value) => Number.isFinite(value));
  return sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
}

export async function saveBufferAsLotJpeg(input: {
  packageDir: string;
  lotNumber: string;
  sequence?: number;
  buffer: Buffer;
  contentType?: string | null;
  sourceUrl?: string;
  source?: OfflinePhotoReference["source"];
  uploadedAt?: string;
}): Promise<OfflinePhotoReference> {
  const photosDir = path.join(input.packageDir, "photos");
  fs.mkdirSync(photosDir, { recursive: true });

  const converted = await convertImageBufferToJpeg(input.buffer, input.contentType);
  const isValid = await validateJpegBuffer(converted.buffer);
  if (!isValid) {
    throw new Error("Converted image is not a valid JPEG.");
  }

  const sequence = input.sequence ?? resolveNextPhotoSequence(photosDir, input.lotNumber);
  let fileName = buildLotPhotoFileName(input.lotNumber, sequence);
  let destination = path.join(photosDir, fileName);
  let collision = 1;
  while (fs.existsSync(destination)) {
    collision += 1;
    fileName = buildLotPhotoFileName(input.lotNumber, sequence + collision);
    destination = path.join(photosDir, fileName);
  }

  fs.writeFileSync(destination, converted.buffer);

  const relativePath = path.posix.join("photos", fileName);
  return {
    relativePath,
    fileName,
    mimeType: "image/jpeg",
    sizeBytes: converted.sizeBytes,
    source: input.source ?? "scraped",
    sourceUrl: input.sourceUrl,
    uploadedAt: input.uploadedAt,
  };
}

export async function normalizeDownloadedPhotoFile(input: {
  packageDir: string;
  lotNumber: string;
  absolutePath: string;
  sourceUrl?: string;
  sequence: number;
}): Promise<OfflinePhotoReference | null> {
  if (!fs.existsSync(input.absolutePath)) {
    return null;
  }

  try {
    const buffer = fs.readFileSync(input.absolutePath);
    const photo = await saveBufferAsLotJpeg({
      packageDir: input.packageDir,
      lotNumber: input.lotNumber,
      sequence: input.sequence,
      buffer,
      sourceUrl: input.sourceUrl,
      source: "scraped",
    });

    if (path.resolve(input.absolutePath) !== path.resolve(path.join(input.packageDir, photo.relativePath ?? ""))) {
      fs.unlinkSync(input.absolutePath);
    }

    return photo;
  } catch {
    return null;
  }
}

export async function normalizeWorkerPhotoReferences(input: {
  packageDir: string;
  lotNumber: string;
  photos: Array<{ relativePath: string; sourceUrl?: string }>;
}): Promise<{ photos: OfflinePhotoReference[]; failed: Array<{ url?: string; reason: string }> }> {
  const photos: OfflinePhotoReference[] = [];
  const failed: Array<{ url?: string; reason: string }> = [];
  let sequence = 1;

  for (const photo of input.photos) {
    const absolutePath = path.join(input.packageDir, photo.relativePath.replace(/\\/g, "/"));
    const normalized = await normalizeDownloadedPhotoFile({
      packageDir: input.packageDir,
      lotNumber: input.lotNumber,
      absolutePath,
      sourceUrl: photo.sourceUrl,
      sequence,
    });
    if (normalized) {
      photos.push(normalized);
      sequence += 1;
      continue;
    }
    failed.push({
      url: photo.sourceUrl,
      reason: "Photo could not be converted to JPEG.",
    });
  }

  return { photos, failed };
}

export function mapWorkerPhotoReferences(input: {
  packageDir: string;
  photos: Array<{ relativePath: string; sourceUrl?: string } | string>;
}): { photos: OfflinePhotoReference[]; failed: Array<{ url?: string; reason: string }> } {
  const photos: OfflinePhotoReference[] = [];
  const failed: Array<{ url?: string; reason: string }> = [];

  for (const photo of input.photos) {
    const relativePath =
      typeof photo === "string" ? photo : photo.relativePath?.replace(/\\/g, "/") ?? "";
    const sourceUrl = typeof photo === "string" ? photo : photo.sourceUrl;
    if (!relativePath) {
      failed.push({ url: sourceUrl, reason: "Photo reference was missing a relative path." });
      continue;
    }

    const absolutePath = path.join(input.packageDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      failed.push({
        url: sourceUrl,
        reason: "Downloaded photo file was not found on disk.",
      });
      continue;
    }

    const stats = fs.statSync(absolutePath);
    if (stats.size <= 0) {
      failed.push({ url: sourceUrl, reason: "Downloaded photo file was empty." });
      continue;
    }

    const extension = path.extname(relativePath).toLowerCase();
    const mimeType =
      extension === ".png"
        ? "image/png"
        : extension === ".webp"
          ? "image/webp"
          : extension === ".gif"
            ? "image/gif"
            : "image/jpeg";

    photos.push({
      relativePath,
      fileName: path.basename(relativePath),
      mimeType,
      sizeBytes: stats.size,
      source: "scraped",
      sourceUrl,
    });
  }

  return { photos, failed };
}
