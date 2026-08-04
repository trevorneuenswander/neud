"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PARTIAL_DOWNLOAD_SUFFIX = exports.DOWNLOAD_COMPLETE_MARKER = void 0;
exports.getAuctionDataDirectory = getAuctionDataDirectory;
exports.getProjectAuctionDataDirectory = getProjectAuctionDataDirectory;
exports.sanitizeProjectSlug = sanitizeProjectSlug;
exports.buildDownloadTimestamp = buildDownloadTimestamp;
exports.buildAuctionExportFileName = buildAuctionExportFileName;
exports.buildAuctionPackageFolderName = buildAuctionPackageFolderName;
exports.buildDownloadJsonFileName = buildDownloadJsonFileName;
exports.isPartialDownloadFolder = isPartialDownloadFolder;
exports.isCompleteDownloadFolder = isCompleteDownloadFolder;
exports.buildBroadArrowExportFolderName = buildBroadArrowExportFolderName;
exports.resolveUniqueBroadArrowExportPackage = resolveUniqueBroadArrowExportPackage;
exports.resolveUniquePartialDownloadPackage = resolveUniquePartialDownloadPackage;
exports.finalizeDownloadPackage = finalizeDownloadPackage;
exports.resolveUniqueAuctionPackageDirectory = resolveUniqueAuctionPackageDirectory;
exports.resolveUniqueAuctionExportPath = resolveUniqueAuctionExportPath;
exports.resolveAuctionJsonPathInPackage = resolveAuctionJsonPathInPackage;
exports.listProjectDownloadRoots = listProjectDownloadRoots;
exports.assertPathWithinRoot = assertPathWithinRoot;
exports.matchesProjectDownloadEntry = matchesProjectDownloadEntry;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
exports.DOWNLOAD_COMPLETE_MARKER = ".download-complete";
exports.PARTIAL_DOWNLOAD_SUFFIX = ".partial";
function ensureDirectory(dir) {
    fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
function getAuctionDataDirectory() {
    return ensureDirectory(path_1.default.join(electron_1.app.getPath("userData"), "auction-data"));
}
function getProjectAuctionDataDirectory(projectSlug) {
    const sanitized = sanitizeProjectSlug(projectSlug);
    return ensureDirectory(path_1.default.join(getAuctionDataDirectory(), sanitized));
}
function sanitizeProjectSlug(slug) {
    const trimmed = slug.trim().toLowerCase();
    const sanitized = trimmed.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-");
    return sanitized.replace(/^-+|-+$/g, "") || "project";
}
function buildDownloadTimestamp(date = new Date()) {
    const datePart = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
    const timePart = [
        String(date.getHours()).padStart(2, "0"),
        String(date.getMinutes()).padStart(2, "0"),
        String(date.getSeconds()).padStart(2, "0"),
    ].join("-");
    return `${datePart}_${timePart}`;
}
/** @deprecated Legacy export basename for compatibility reads */
function buildAuctionExportFileName(date = new Date()) {
    const datePart = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
    const timePart = [
        String(date.getHours()).padStart(2, "0"),
        String(date.getMinutes()).padStart(2, "0"),
        String(date.getSeconds()).padStart(2, "0"),
    ].join("");
    return `broad-arrow-auction-${datePart}-${timePart}`;
}
function buildAuctionPackageFolderName(date = new Date()) {
    return buildAuctionExportFileName(date);
}
function buildDownloadJsonFileName(projectSlug, timestamp) {
    return `${sanitizeProjectSlug(projectSlug)}_${timestamp}.json`;
}
function isPartialDownloadFolder(folderName) {
    return folderName.endsWith(exports.PARTIAL_DOWNLOAD_SUFFIX);
}
function isCompleteDownloadFolder(packageDir) {
    if (!fs_1.default.existsSync(packageDir) || !fs_1.default.statSync(packageDir).isDirectory()) {
        return false;
    }
    if (isPartialDownloadFolder(path_1.default.basename(packageDir))) {
        return false;
    }
    if (fs_1.default.existsSync(path_1.default.join(packageDir, exports.DOWNLOAD_COMPLETE_MARKER))) {
        return true;
    }
    return resolveAuctionJsonPathInPackage(packageDir) !== null;
}
function buildBroadArrowExportFolderName(projectName, date = new Date()) {
    const sanitized = projectName
        .trim()
        .replace(/[^\w\s-]+/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "") || "Broad-Arrow-Auctions";
    return `${sanitized}-${buildDownloadTimestamp(date)}`;
}
function resolveUniqueBroadArrowExportPackage(projectSlug, projectName, date = new Date()) {
    const timestamp = buildDownloadTimestamp(date);
    const projectRoot = getProjectAuctionDataDirectory(projectSlug);
    const folderBase = buildBroadArrowExportFolderName(projectName, date);
    let folderName = `${folderBase}${exports.PARTIAL_DOWNLOAD_SUFFIX}`;
    let packageDir = path_1.default.join(projectRoot, folderName);
    let suffix = 2;
    while (fs_1.default.existsSync(packageDir)) {
        folderName = `${folderBase}-${suffix}${exports.PARTIAL_DOWNLOAD_SUFFIX}`;
        packageDir = path_1.default.join(projectRoot, folderName);
        suffix += 1;
    }
    const photosDir = path_1.default.join(packageDir, "photos");
    fs_1.default.mkdirSync(photosDir, { recursive: true });
    return {
        packageDir,
        jsonPath: path_1.default.join(packageDir, `${folderBase}.json`),
        photosDir,
        timestamp,
        projectSlug: sanitizeProjectSlug(projectSlug),
    };
}
function resolveUniquePartialDownloadPackage(projectSlug, date = new Date()) {
    const timestamp = buildDownloadTimestamp(date);
    const projectRoot = getProjectAuctionDataDirectory(projectSlug);
    let folderName = `${timestamp}${exports.PARTIAL_DOWNLOAD_SUFFIX}`;
    let packageDir = path_1.default.join(projectRoot, folderName);
    let suffix = 2;
    while (fs_1.default.existsSync(packageDir)) {
        folderName = `${timestamp}-${suffix}${exports.PARTIAL_DOWNLOAD_SUFFIX}`;
        packageDir = path_1.default.join(projectRoot, folderName);
        suffix += 1;
    }
    const photosDir = path_1.default.join(packageDir, "photos");
    fs_1.default.mkdirSync(photosDir, { recursive: true });
    return {
        packageDir,
        jsonPath: path_1.default.join(packageDir, buildDownloadJsonFileName(projectSlug, timestamp)),
        photosDir,
        timestamp,
        projectSlug: sanitizeProjectSlug(projectSlug),
    };
}
function finalizeDownloadPackage(packageDir) {
    if (!fs_1.default.existsSync(packageDir)) {
        throw new Error("Download package directory is missing.");
    }
    const baseName = path_1.default.basename(packageDir);
    if (!baseName.endsWith(exports.PARTIAL_DOWNLOAD_SUFFIX)) {
        fs_1.default.writeFileSync(path_1.default.join(packageDir, exports.DOWNLOAD_COMPLETE_MARKER), new Date().toISOString(), "utf8");
        return packageDir;
    }
    const finalName = baseName.slice(0, -exports.PARTIAL_DOWNLOAD_SUFFIX.length);
    const finalDir = path_1.default.join(path_1.default.dirname(packageDir), finalName);
    if (fs_1.default.existsSync(finalDir)) {
        throw new Error("A completed download folder with the same timestamp already exists.");
    }
    fs_1.default.renameSync(packageDir, finalDir);
    fs_1.default.writeFileSync(path_1.default.join(finalDir, exports.DOWNLOAD_COMPLETE_MARKER), new Date().toISOString(), "utf8");
    return finalDir;
}
function resolveUniqueAuctionPackageDirectory(directory, date = new Date()) {
    const baseName = buildAuctionPackageFolderName(date);
    let candidate = path_1.default.join(directory, baseName);
    let suffix = 2;
    while (fs_1.default.existsSync(candidate)) {
        candidate = path_1.default.join(directory, `${baseName}-${suffix}`);
        suffix += 1;
    }
    return candidate;
}
function resolveUniqueAuctionExportPath(directory, date = new Date()) {
    const packageDir = resolveUniqueAuctionPackageDirectory(directory, date);
    const baseName = path_1.default.basename(packageDir);
    return path_1.default.join(packageDir, `${baseName}.json`);
}
function resolveAuctionJsonPathInPackage(packageDir) {
    if (!fs_1.default.existsSync(packageDir))
        return null;
    const manifestPath = path_1.default.join(packageDir, "manifest.json");
    if (fs_1.default.existsSync(manifestPath)) {
        try {
            const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, "utf8"));
            if (manifest.jsonFileName) {
                const manifestJsonPath = path_1.default.join(packageDir, manifest.jsonFileName);
                if (fs_1.default.existsSync(manifestJsonPath)) {
                    return manifestJsonPath;
                }
            }
        }
        catch {
            // Fall through to filename heuristics.
        }
    }
    const entries = fs_1.default.readdirSync(packageDir, { withFileTypes: true });
    const jsonFiles = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
        .map((entry) => entry.name)
        .filter((name) => name.toLowerCase() !== "manifest.json");
    const baseName = path_1.default.basename(packageDir);
    const preferred = [
        path_1.default.join(packageDir, `${baseName}.json`),
        path_1.default.join(packageDir, "auction-data.json"),
        ...jsonFiles.map((name) => path_1.default.join(packageDir, name)),
        path_1.default.join(packageDir, "auction.json"),
    ];
    for (const candidate of preferred) {
        if (fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    if (jsonFiles.length === 1) {
        return path_1.default.join(packageDir, jsonFiles[0]);
    }
    return null;
}
function listProjectDownloadRoots(projectSlug) {
    const roots = [getAuctionDataDirectory()];
    const projectRoot = getProjectAuctionDataDirectory(projectSlug);
    if (projectRoot !== roots[0]) {
        roots.push(projectRoot);
    }
    return roots;
}
function assertPathWithinRoot(targetPath, rootPath) {
    const resolvedTarget = path_1.default.resolve(targetPath);
    const resolvedRoot = path_1.default.resolve(rootPath);
    if (resolvedTarget === resolvedRoot ||
        !resolvedTarget.startsWith(`${resolvedRoot}${path_1.default.sep}`)) {
        throw new Error("Unsafe download path.");
    }
    return resolvedTarget;
}
function matchesProjectDownloadEntry(entryName, projectSlug) {
    const slug = sanitizeProjectSlug(projectSlug);
    const lower = entryName.toLowerCase();
    const slugLower = slug.toLowerCase();
    if (lower.startsWith(`${slugLower}_`) || lower.startsWith(`${slugLower}-`)) {
        return true;
    }
    if (slugLower.includes("broad-arrow") && lower.startsWith("broad-arrow-auction-")) {
        return true;
    }
    if (/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d+)?(\.partial)?$/.test(entryName)) {
        return true;
    }
    return false;
}
