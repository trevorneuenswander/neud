import fs from "fs";
import path from "path";

const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

type PuppeteerPhotoPage = {
  goto: (
    url: string,
    options?: Record<string, unknown>,
  ) => Promise<{ ok: () => boolean; status: () => number; buffer: () => Promise<Buffer>; headers: () => Record<string, string> } | null>;
};

function extensionFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname);
    if (ext && ext.length <= 5) {
      return ext.toLowerCase();
    }
  } catch {
    // ignore
  }
  return "";
}

function extensionFromContentType(contentType: string | null | undefined): string {
  if (!contentType) return ".jpg";
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  return CONTENT_TYPE_EXTENSION[normalized] ?? ".jpg";
}

function looksLikeImageBuffer(buffer: Buffer, contentType: string | null | undefined): boolean {
  if (!buffer.length) return false;
  if (contentType?.startsWith("image/")) return true;
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return true;
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return true;
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return true;
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return true;
  return false;
}

export async function downloadExportPhotoBytes(input: {
  photoUrl: string;
  destinationPath: string;
  page?: PuppeteerPhotoPage | null;
}): Promise<{ contentType: string; sizeBytes: number; finalPath: string }> {
  let buffer: Buffer | null = null;
  let contentType = "";

  try {
    const response = await fetch(input.photoUrl, {
      headers: { Accept: "image/*,*/*" },
    });
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer());
      const type = response.headers.get("content-type");
      if (looksLikeImageBuffer(bytes, type)) {
        buffer = bytes;
        contentType = type ?? "";
      }
    }
  } catch {
    // fall through to browser download
  }

  if (!buffer && input.page) {
    const response = await input.page.goto(input.photoUrl, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    if (!response?.ok()) {
      throw new Error(`HTTP ${response?.status?.() ?? "unknown"} for photo`);
    }
    buffer = await response.buffer();
    contentType = response.headers()["content-type"] ?? "";
    if (!looksLikeImageBuffer(buffer, contentType)) {
      throw new Error("Photo response was not a valid image.");
    }
  }

  if (!buffer || buffer.length === 0) {
    throw new Error("Photo response was empty.");
  }

  let extension = extensionFromUrl(input.photoUrl) || extensionFromContentType(contentType);
  let finalPath = input.destinationPath;
  if (!path.extname(finalPath)) {
    finalPath = `${finalPath}${extension}`;
  } else if (!extensionFromUrl(input.photoUrl)) {
    const base = finalPath.slice(0, -path.extname(finalPath).length);
    finalPath = `${base}${extensionFromContentType(contentType)}`;
  }

  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, buffer);

  return {
    contentType,
    sizeBytes: buffer.length,
    finalPath,
  };
}

export function sanitizeLotPhotoFolder(lotNumber: string): string {
  return `lot-${String(lotNumber).replace(/[^\w.-]+/g, "-")}`;
}
