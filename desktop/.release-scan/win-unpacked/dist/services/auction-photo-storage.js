"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeLotNumberForFilename = sanitizeLotNumberForFilename;
exports.buildLotPhotoFileName = buildLotPhotoFileName;
exports.resolveNextPhotoSequence = resolveNextPhotoSequence;
exports.saveBufferAsLotJpeg = saveBufferAsLotJpeg;
exports.normalizeDownloadedPhotoFile = normalizeDownloadedPhotoFile;
exports.normalizeWorkerPhotoReferences = normalizeWorkerPhotoReferences;
exports.mapWorkerPhotoReferences = mapWorkerPhotoReferences;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const image_jpeg_conversion_1 = require("./image-jpeg-conversion");
function sanitizeLotNumberForFilename(lotNumber) {
    const normalized = lotNumber.replace(/^lot\s+/i, "").trim();
    const sanitized = normalized.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
    return sanitized.replace(/^-+|-+$/g, "") || "unknown";
}
function buildLotPhotoFileName(lotNumber, sequence) {
    const lotKey = sanitizeLotNumberForFilename(lotNumber);
    return `lot-${lotKey}_${String(sequence).padStart(2, "0")}.jpg`;
}
function resolveNextPhotoSequence(photosDir, lotNumber) {
    if (!fs_1.default.existsSync(photosDir))
        return 1;
    const prefix = `lot-${sanitizeLotNumberForFilename(lotNumber)}_`;
    const sequences = fs_1.default
        .readdirSync(photosDir)
        .filter((name) => name.startsWith(prefix) && name.toLowerCase().endsWith(".jpg"))
        .map((name) => Number(name.slice(prefix.length, -4)))
        .filter((value) => Number.isFinite(value));
    return sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
}
async function saveBufferAsLotJpeg(input) {
    const photosDir = path_1.default.join(input.packageDir, "photos");
    fs_1.default.mkdirSync(photosDir, { recursive: true });
    const converted = await (0, image_jpeg_conversion_1.convertImageBufferToJpeg)(input.buffer, input.contentType);
    const isValid = await (0, image_jpeg_conversion_1.validateJpegBuffer)(converted.buffer);
    if (!isValid) {
        throw new Error("Converted image is not a valid JPEG.");
    }
    const sequence = input.sequence ?? resolveNextPhotoSequence(photosDir, input.lotNumber);
    let fileName = buildLotPhotoFileName(input.lotNumber, sequence);
    let destination = path_1.default.join(photosDir, fileName);
    let collision = 1;
    while (fs_1.default.existsSync(destination)) {
        collision += 1;
        fileName = buildLotPhotoFileName(input.lotNumber, sequence + collision);
        destination = path_1.default.join(photosDir, fileName);
    }
    fs_1.default.writeFileSync(destination, converted.buffer);
    const relativePath = path_1.default.posix.join("photos", fileName);
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
async function normalizeDownloadedPhotoFile(input) {
    if (!fs_1.default.existsSync(input.absolutePath)) {
        return null;
    }
    try {
        const buffer = fs_1.default.readFileSync(input.absolutePath);
        const photo = await saveBufferAsLotJpeg({
            packageDir: input.packageDir,
            lotNumber: input.lotNumber,
            sequence: input.sequence,
            buffer,
            sourceUrl: input.sourceUrl,
            source: "scraped",
        });
        if (path_1.default.resolve(input.absolutePath) !== path_1.default.resolve(path_1.default.join(input.packageDir, photo.relativePath ?? ""))) {
            fs_1.default.unlinkSync(input.absolutePath);
        }
        return photo;
    }
    catch {
        return null;
    }
}
async function normalizeWorkerPhotoReferences(input) {
    const photos = [];
    const failed = [];
    let sequence = 1;
    for (const photo of input.photos) {
        const absolutePath = path_1.default.join(input.packageDir, photo.relativePath.replace(/\\/g, "/"));
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
function mapWorkerPhotoReferences(input) {
    const photos = [];
    const failed = [];
    for (const photo of input.photos) {
        const relativePath = typeof photo === "string" ? photo : photo.relativePath?.replace(/\\/g, "/") ?? "";
        const sourceUrl = typeof photo === "string" ? photo : photo.sourceUrl;
        if (!relativePath) {
            failed.push({ url: sourceUrl, reason: "Photo reference was missing a relative path." });
            continue;
        }
        const absolutePath = path_1.default.join(input.packageDir, relativePath);
        if (!fs_1.default.existsSync(absolutePath)) {
            failed.push({
                url: sourceUrl,
                reason: "Downloaded photo file was not found on disk.",
            });
            continue;
        }
        const stats = fs_1.default.statSync(absolutePath);
        if (stats.size <= 0) {
            failed.push({ url: sourceUrl, reason: "Downloaded photo file was empty." });
            continue;
        }
        const extension = path_1.default.extname(relativePath).toLowerCase();
        const mimeType = extension === ".png"
            ? "image/png"
            : extension === ".webp"
                ? "image/webp"
                : extension === ".gif"
                    ? "image/gif"
                    : "image/jpeg";
        photos.push({
            relativePath,
            fileName: path_1.default.basename(relativePath),
            mimeType,
            sizeBytes: stats.size,
            source: "scraped",
            sourceUrl,
        });
    }
    return { photos, failed };
}
