import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const PHOTO_DOWNLOADER_MODULE = fileURLToPath(import.meta.url);

const CONTENT_TYPE_EXTENSION = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function extensionFromUrl(url) {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname);
    if (ext && ext.length <= 5) return ext.toLowerCase();
  } catch {
    // ignore
  }
  return "";
}

function extensionFromContentType(contentType) {
  if (!contentType) return ".jpg";
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  return CONTENT_TYPE_EXTENSION[normalized] ?? ".jpg";
}

function sanitizeLotFolder(lotNumber) {
  return `lot-${String(lotNumber).replace(/[^\w.-]+/g, "-")}`;
}

async function downloadWithPage(page, url, destinationPath) {
  const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
  if (!response || !response.ok()) {
    throw new Error(`HTTP ${response?.status?.() ?? "unknown"} for photo`);
  }
  const buffer = await response.buffer();
  if (!buffer || buffer.length === 0) {
    throw new Error("Photo response was empty.");
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, buffer);
  return {
    contentType: response.headers()["content-type"] ?? "",
    sizeBytes: buffer.length,
  };
}

export async function downloadLotPhotos(
  page,
  lotNumber,
  photoUrls,
  downloadRoot,
  options = {},
) {
  const shouldAbort =
    typeof options.shouldAbort === "function" ? options.shouldAbort : () => false;
  const onPhotoProgress =
    typeof options.onPhotoProgress === "function" ? options.onPhotoProgress : null;
  const lotFolder = sanitizeLotFolder(lotNumber);
  const references = [];
  const failed = [];
  const diagnostics = [];

  for (let index = 0; index < photoUrls.length; index += 1) {
    if (shouldAbort()) {
      break;
    }

    const sourceUrl = photoUrls[index];
    if (!sourceUrl) continue;

    onPhotoProgress?.({
      lotNumber,
      photoIndex: index + 1,
      photoTotal: photoUrls.length,
      terminal: false,
    });

    const sequence = String(index + 1).padStart(3, "0");
    let extension = extensionFromUrl(sourceUrl) || ".jpg";
    const relativePath = path.posix.join("photos", lotFolder, `${sequence}${extension}`);
    const absolutePath = path.join(downloadRoot, relativePath);

    try {
      const result = await downloadWithPage(page, sourceUrl, absolutePath);
      if (!extensionFromUrl(sourceUrl)) {
        extension = extensionFromContentType(result.contentType);
        if (!absolutePath.endsWith(extension)) {
          const renamedRelative = path.posix.join("photos", lotFolder, `${sequence}${extension}`);
          const renamedAbsolute = path.join(downloadRoot, renamedRelative);
          fs.renameSync(absolutePath, renamedAbsolute);
          references.push({
            relativePath: renamedRelative.replace(/\\/g, "/"),
            sourceUrl,
          });
          diagnostics.push({
            lotNumber,
            sourceUrl,
            destinationPath: renamedRelative.replace(/\\/g, "/"),
            contentType: result.contentType || null,
            sizeBytes: result.sizeBytes,
            failureReason: null,
          });
          onPhotoProgress?.({
            lotNumber,
            photoIndex: index + 1,
            photoTotal: photoUrls.length,
            terminal: true,
          });
          continue;
        }
      }
      references.push({
        relativePath: relativePath.replace(/\\/g, "/"),
        sourceUrl,
      });
      diagnostics.push({
        lotNumber,
        sourceUrl,
        destinationPath: relativePath.replace(/\\/g, "/"),
        contentType: result.contentType || null,
        sizeBytes: result.sizeBytes,
        failureReason: null,
      });
      onPhotoProgress?.({
        lotNumber,
        photoIndex: index + 1,
        photoTotal: photoUrls.length,
        terminal: true,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Photo download failed.";
      failed.push({
        lot: lotNumber,
        url: sourceUrl,
        reason,
      });
      diagnostics.push({
        lotNumber,
        sourceUrl,
        destinationPath: relativePath.replace(/\\/g, "/"),
        contentType: null,
        sizeBytes: 0,
        failureReason: reason,
      });
      onPhotoProgress?.({
        lotNumber,
        photoIndex: index + 1,
        photoTotal: photoUrls.length,
        terminal: true,
      });
    }
  }

  return { references, failed, diagnostics };
}

export async function mapWithConcurrency(items, concurrency, worker) {
  const results = [];
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}
