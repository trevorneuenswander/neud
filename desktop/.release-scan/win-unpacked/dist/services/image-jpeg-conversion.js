"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertImageBufferToJpeg = convertImageBufferToJpeg;
exports.validateJpegBuffer = validateJpegBuffer;
const sharp_1 = __importDefault(require("sharp"));
const SUPPORTED_INPUT_MIME = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
    "image/tiff",
]);
function normalizeMimeType(contentType) {
    if (!contentType)
        return null;
    return contentType.split(";")[0]?.trim().toLowerCase() ?? null;
}
async function convertImageBufferToJpeg(input, contentType) {
    if (!input || input.length === 0) {
        throw new Error("Image data is empty.");
    }
    let pipeline = (0, sharp_1.default)(input, { failOn: "error" }).rotate();
    const metadata = await pipeline.metadata();
    const detectedFormat = metadata.format ?? null;
    const normalizedMime = normalizeMimeType(contentType);
    if (normalizedMime &&
        !normalizedMime.startsWith("image/") &&
        !SUPPORTED_INPUT_MIME.has(normalizedMime)) {
        throw new Error(`Unsupported image content type: ${normalizedMime}`);
    }
    if (detectedFormat === "jpeg") {
        const jpegBuffer = await (0, sharp_1.default)(input).jpeg({ quality: 100 }).toBuffer();
        return {
            buffer: jpegBuffer,
            mimeType: "image/jpeg",
            sizeBytes: jpegBuffer.length,
            sourceFormat: detectedFormat,
        };
    }
    const jpegBuffer = await (0, sharp_1.default)(input)
        .rotate()
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
    await (0, sharp_1.default)(jpegBuffer).metadata();
    return {
        buffer: jpegBuffer,
        mimeType: "image/jpeg",
        sizeBytes: jpegBuffer.length,
        sourceFormat: detectedFormat,
    };
}
async function validateJpegBuffer(buffer) {
    try {
        const metadata = await (0, sharp_1.default)(buffer).metadata();
        return metadata.format === "jpeg";
    }
    catch {
        return false;
    }
}
