import sharp from "sharp";

export type JpegConversionResult = {
  buffer: Buffer;
  mimeType: "image/jpeg";
  sizeBytes: number;
  sourceFormat: string | null;
};

const SUPPORTED_INPUT_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/tiff",
]);

function normalizeMimeType(contentType: string | null | undefined): string | null {
  if (!contentType) return null;
  return contentType.split(";")[0]?.trim().toLowerCase() ?? null;
}

export async function convertImageBufferToJpeg(
  input: Buffer,
  contentType?: string | null,
): Promise<JpegConversionResult> {
  if (!input || input.length === 0) {
    throw new Error("Image data is empty.");
  }

  let pipeline = sharp(input, { failOn: "error" }).rotate();
  const metadata = await pipeline.metadata();
  const detectedFormat = metadata.format ?? null;
  const normalizedMime = normalizeMimeType(contentType);

  if (
    normalizedMime &&
    !normalizedMime.startsWith("image/") &&
    !SUPPORTED_INPUT_MIME.has(normalizedMime)
  ) {
    throw new Error(`Unsupported image content type: ${normalizedMime}`);
  }

  if (detectedFormat === "jpeg") {
    const jpegBuffer = await sharp(input).jpeg({ quality: 100 }).toBuffer();
    return {
      buffer: jpegBuffer,
      mimeType: "image/jpeg",
      sizeBytes: jpegBuffer.length,
      sourceFormat: detectedFormat,
    };
  }

  const jpegBuffer = await sharp(input)
    .rotate()
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  await sharp(jpegBuffer).metadata();

  return {
    buffer: jpegBuffer,
    mimeType: "image/jpeg",
    sizeBytes: jpegBuffer.length,
    sourceFormat: detectedFormat,
  };
}

export async function validateJpegBuffer(buffer: Buffer): Promise<boolean> {
  try {
    const metadata = await sharp(buffer).metadata();
    return metadata.format === "jpeg";
  } catch {
    return false;
  }
}
