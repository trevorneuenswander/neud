"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadExportPhotoBytes = downloadExportPhotoBytes;
exports.sanitizeLotPhotoFolder = sanitizeLotPhotoFolder;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CONTENT_TYPE_EXTENSION = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
};
function extensionFromUrl(url) {
    try {
        const ext = path_1.default.extname(new URL(url).pathname);
        if (ext && ext.length <= 5) {
            return ext.toLowerCase();
        }
    }
    catch {
        // ignore
    }
    return "";
}
function extensionFromContentType(contentType) {
    if (!contentType)
        return ".jpg";
    const normalized = contentType.split(";")[0].trim().toLowerCase();
    return CONTENT_TYPE_EXTENSION[normalized] ?? ".jpg";
}
function looksLikeImageBuffer(buffer, contentType) {
    if (!buffer.length)
        return false;
    if (contentType?.startsWith("image/"))
        return true;
    if (buffer[0] === 0xff && buffer[1] === 0xd8)
        return true;
    if (buffer[0] === 0x89 && buffer[1] === 0x50)
        return true;
    if (buffer[0] === 0x47 && buffer[1] === 0x49)
        return true;
    if (buffer[0] === 0x52 && buffer[1] === 0x49)
        return true;
    return false;
}
async function downloadExportPhotoBytes(input) {
    let buffer = null;
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
    }
    catch {
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
    if (!path_1.default.extname(finalPath)) {
        finalPath = `${finalPath}${extension}`;
    }
    else if (!extensionFromUrl(input.photoUrl)) {
        const base = finalPath.slice(0, -path_1.default.extname(finalPath).length);
        finalPath = `${base}${extensionFromContentType(contentType)}`;
    }
    fs_1.default.mkdirSync(path_1.default.dirname(finalPath), { recursive: true });
    fs_1.default.writeFileSync(finalPath, buffer);
    return {
        contentType,
        sizeBytes: buffer.length,
        finalPath,
    };
}
function sanitizeLotPhotoFolder(lotNumber) {
    return `lot-${String(lotNumber).replace(/[^\w.-]+/g, "-")}`;
}
