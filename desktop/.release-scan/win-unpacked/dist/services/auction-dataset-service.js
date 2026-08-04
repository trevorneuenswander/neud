"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuctionDatasetService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const auction_data_paths_1 = require("./auction-data-paths");
const auction_download_size_1 = require("./auction-download-size");
function settingsKey(projectId) {
    return `auctionDataset:${projectId}`;
}
function basenameFromPath(filePath) {
    if (!filePath)
        return undefined;
    return path_1.default.basename(filePath);
}
function readDownloadedAt(jsonPath, packageDir) {
    try {
        const parsed = JSON.parse(fs_1.default.readFileSync(jsonPath, "utf8"));
        return parsed.downloadedAt ?? parsed.exportedAt ?? fs_1.default.statSync(jsonPath).mtime.toISOString();
    }
    catch {
        const markerPath = path_1.default.join(packageDir, auction_data_paths_1.DOWNLOAD_COMPLETE_MARKER);
        if (fs_1.default.existsSync(markerPath)) {
            const marker = fs_1.default.readFileSync(markerPath, "utf8").trim();
            if (marker) {
                const parsedDate = Date.parse(marker);
                if (Number.isFinite(parsedDate)) {
                    return new Date(parsedDate).toISOString();
                }
            }
        }
        return fs_1.default.statSync(jsonPath).mtime.toISOString();
    }
}
class AuctionDatasetService {
    settings;
    projects;
    constructor(settings, projects) {
        this.settings = settings;
        this.projects = projects;
    }
    getReference(projectId) {
        return this.settings.get(settingsKey(projectId), null);
    }
    setReference(projectId, reference) {
        const totalSizeBytes = reference.filePath && reference.filePath !== undefined
            ? (0, auction_download_size_1.calculateDownloadPackageSizeBytes)(path_1.default.dirname(reference.filePath))
            : reference.totalSizeBytes;
        const normalized = {
            ...reference,
            filename: reference.filename ?? basenameFromPath(reference.filePath),
            loadedAt: reference.loadedAt || new Date().toISOString(),
            totalSizeBytes,
            totalSizeFormatted: reference.totalSizeFormatted ??
                (typeof totalSizeBytes === "number" ? (0, auction_download_size_1.formatDownloadSize)(totalSizeBytes) : undefined),
        };
        this.settings.set(settingsKey(projectId), normalized);
        return normalized;
    }
    setDownloaded(projectId, filePath) {
        const existing = this.getReference(projectId);
        if (existing?.manualOverride) {
            return existing;
        }
        return this.setReference(projectId, {
            source: "downloaded",
            filePath,
            filename: basenameFromPath(filePath),
            loadedAt: new Date().toISOString(),
            manualOverride: false,
        });
    }
    setLoaded(projectId, filePath) {
        return this.setReference(projectId, {
            source: "loaded",
            filePath,
            filename: basenameFromPath(filePath),
            loadedAt: new Date().toISOString(),
            manualOverride: true,
        });
    }
    clearDownloadReference(projectId) {
        const cleared = {
            source: "none",
            loadedAt: new Date().toISOString(),
            manualOverride: false,
            filePath: undefined,
            filename: undefined,
            totalSizeBytes: undefined,
            totalSizeFormatted: undefined,
        };
        this.settings.set(settingsKey(projectId), cleared);
        return cleared;
    }
    setLiveSnapshot(projectId) {
        const existing = this.getReference(projectId);
        if (existing?.manualOverride) {
            return existing;
        }
        return this.setReference(projectId, {
            source: "live-snapshot",
            loadedAt: new Date().toISOString(),
            manualOverride: false,
        });
    }
    clearManualOverride(projectId) {
        const existing = this.getReference(projectId);
        if (!existing)
            return null;
        if (!existing.manualOverride)
            return existing;
        const recent = this.findMostRecentDownloadFile(projectId);
        if (recent) {
            return this.setReference(projectId, {
                source: "downloaded",
                filePath: recent.jsonPath,
                filename: basenameFromPath(recent.jsonPath),
                loadedAt: new Date().toISOString(),
                manualOverride: false,
                totalSizeBytes: recent.totalSizeBytes,
                totalSizeFormatted: recent.totalSizeFormatted,
            });
        }
        return this.setLiveSnapshot(projectId);
    }
    isFileDatasetActive(projectId) {
        const reference = this.resolveActiveReference(projectId);
        return reference?.source === "downloaded" || reference?.source === "loaded";
    }
    resolveProjectSlug(projectId) {
        const project = this.projects?.getById(projectId);
        return (0, auction_data_paths_1.sanitizeProjectSlug)(project?.slug ?? projectId);
    }
    listCompletedDownloads(projectId) {
        const projectSlug = this.resolveProjectSlug(projectId);
        const roots = (0, auction_data_paths_1.listProjectDownloadRoots)(projectSlug);
        const entries = [];
        for (const root of roots) {
            if (!fs_1.default.existsSync(root))
                continue;
            for (const entry of fs_1.default.readdirSync(root, { withFileTypes: true })) {
                if (!entry.isDirectory() || (0, auction_data_paths_1.isPartialDownloadFolder)(entry.name)) {
                    continue;
                }
                const packageDir = path_1.default.join(root, entry.name);
                if (!(0, auction_data_paths_1.isCompleteDownloadFolder)(packageDir))
                    continue;
                const jsonPath = (0, auction_data_paths_1.resolveAuctionJsonPathInPackage)(packageDir);
                if (!jsonPath)
                    continue;
                const totalSizeBytes = (0, auction_download_size_1.calculateDownloadPackageSizeBytes)(packageDir);
                let lotCount = 0;
                try {
                    const parsed = JSON.parse(fs_1.default.readFileSync(jsonPath, "utf8"));
                    lotCount = Array.isArray(parsed.lots) ? parsed.lots.length : 0;
                }
                catch {
                    continue;
                }
                entries.push({
                    packageDir,
                    jsonPath,
                    filename: path_1.default.basename(jsonPath),
                    downloadedAt: readDownloadedAt(jsonPath, packageDir),
                    totalSizeBytes,
                    totalSizeFormatted: (0, auction_download_size_1.formatDownloadSize)(totalSizeBytes),
                    lotCount,
                });
            }
            for (const entry of fs_1.default.readdirSync(root, { withFileTypes: true })) {
                if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json"))
                    continue;
                const jsonPath = path_1.default.join(root, entry.name);
                const packageDir = path_1.default.dirname(jsonPath);
                if (entries.some((candidate) => candidate.jsonPath === jsonPath))
                    continue;
                const totalSizeBytes = (0, auction_download_size_1.calculateDownloadPackageSizeBytes)(packageDir);
                entries.push({
                    packageDir,
                    jsonPath,
                    filename: entry.name,
                    downloadedAt: readDownloadedAt(jsonPath, packageDir),
                    totalSizeBytes,
                    totalSizeFormatted: (0, auction_download_size_1.formatDownloadSize)(totalSizeBytes),
                    lotCount: 0,
                });
            }
        }
        entries.sort((left, right) => Date.parse(right.downloadedAt) - Date.parse(left.downloadedAt));
        return entries;
    }
    findMostRecentDownloadFile(projectId) {
        if (!projectId) {
            const directory = (0, auction_data_paths_1.getAuctionDataDirectory)();
            if (!fs_1.default.existsSync(directory))
                return null;
            const legacyEntries = [];
            for (const entry of fs_1.default.readdirSync(directory, { withFileTypes: true })) {
                if (!entry.isDirectory() || (0, auction_data_paths_1.isPartialDownloadFolder)(entry.name))
                    continue;
                const packageDir = path_1.default.join(directory, entry.name);
                if (!(0, auction_data_paths_1.isCompleteDownloadFolder)(packageDir))
                    continue;
                const jsonPath = (0, auction_data_paths_1.resolveAuctionJsonPathInPackage)(packageDir);
                if (!jsonPath)
                    continue;
                legacyEntries.push({
                    packageDir,
                    jsonPath,
                    filename: path_1.default.basename(jsonPath),
                    downloadedAt: readDownloadedAt(jsonPath, packageDir),
                    totalSizeBytes: (0, auction_download_size_1.calculateDownloadPackageSizeBytes)(packageDir),
                    totalSizeFormatted: (0, auction_download_size_1.formatDownloadSize)((0, auction_download_size_1.calculateDownloadPackageSizeBytes)(packageDir)),
                    lotCount: 0,
                });
            }
            legacyEntries.sort((left, right) => Date.parse(right.downloadedAt) - Date.parse(left.downloadedAt));
            return legacyEntries[0] ?? null;
        }
        return this.listCompletedDownloads(projectId)[0] ?? null;
    }
    resolveActiveReference(projectId) {
        const stored = this.getReference(projectId);
        if (stored?.source === "none") {
            return stored;
        }
        if (stored?.filePath && fs_1.default.existsSync(stored.filePath)) {
            const packageDir = path_1.default.dirname(stored.filePath);
            const totalSizeBytes = (0, auction_download_size_1.calculateDownloadPackageSizeBytes)(packageDir);
            return {
                ...stored,
                totalSizeBytes,
                totalSizeFormatted: (0, auction_download_size_1.formatDownloadSize)(totalSizeBytes),
            };
        }
        if (stored?.source === "live-snapshot") {
            return stored;
        }
        const recent = this.findMostRecentDownloadFile(projectId);
        if (recent) {
            return this.setReference(projectId, {
                source: "downloaded",
                filePath: recent.jsonPath,
                filename: recent.filename,
                loadedAt: recent.downloadedAt,
                manualOverride: false,
                totalSizeBytes: recent.totalSizeBytes,
                totalSizeFormatted: recent.totalSizeFormatted,
            });
        }
        if (stored) {
            return this.setLiveSnapshot(projectId);
        }
        return null;
    }
    readActiveDataset(projectId) {
        const reference = this.resolveActiveReference(projectId);
        if (!reference?.filePath || !fs_1.default.existsSync(reference.filePath)) {
            return null;
        }
        try {
            const raw = fs_1.default.readFileSync(reference.filePath, "utf8");
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : null;
        }
        catch {
            return null;
        }
    }
    getDisplayInfo(projectId) {
        const reference = this.resolveActiveReference(projectId);
        if (!reference || reference.source === "none") {
            return {
                reference: reference ?? {
                    source: "none",
                    loadedAt: new Date().toISOString(),
                },
                label: "No local downloads available.",
                tooltip: "No local downloads available.",
            };
        }
        if (reference.source === "live-snapshot") {
            return {
                reference,
                label: "Live scraper snapshot",
                tooltip: "Live scraper snapshot",
            };
        }
        const filename = reference.filename ?? basenameFromPath(reference.filePath) ?? "auction.json";
        const sizeLabel = reference.totalSizeFormatted
            ? ` · ${reference.totalSizeFormatted}`
            : "";
        return {
            reference,
            label: `${filename}${sizeLabel}`,
            tooltip: reference.filePath ?? filename,
            totalSizeBytes: reference.totalSizeBytes,
            totalSizeFormatted: reference.totalSizeFormatted,
        };
    }
    getActiveDownloadFolder(projectId) {
        const reference = this.resolveActiveReference(projectId);
        if (!reference?.filePath)
            return null;
        return path_1.default.dirname(reference.filePath);
    }
    createManualWorkingDownload(projectId) {
        const project = this.projects?.getById(projectId);
        const projectSlug = (0, auction_data_paths_1.sanitizeProjectSlug)(project?.slug ?? projectId);
        const projectName = project?.name ?? "Broad Arrow Auctions";
        const paths = (0, auction_data_paths_1.resolveUniquePartialDownloadPackage)(projectSlug);
        const exportedAt = new Date().toISOString();
        const payload = {
            formatVersion: 2,
            exportedAt,
            downloadedAt: exportedAt,
            source: "local-controller",
            auction: { name: projectName },
            scrape: {
                snapshot: {},
            },
            lotCount: 0,
            lots: [],
            photoDiscovery: {
                attempted: 0,
                succeeded: 0,
                failed: [],
            },
        };
        fs_1.default.writeFileSync(paths.jsonPath, JSON.stringify(payload, null, 2), "utf8");
        return { packageDir: paths.packageDir, jsonPath: paths.jsonPath };
    }
    clearAllDownloads(projectId) {
        const projectSlug = this.resolveProjectSlug(projectId);
        const projectRoot = (0, auction_data_paths_1.getProjectAuctionDataDirectory)(projectSlug);
        const legacyRoot = (0, auction_data_paths_1.getAuctionDataDirectory)();
        let foldersRemoved = 0;
        let filesRemoved = 0;
        let bytesRemoved = 0;
        const removeTarget = (targetPath, rootPath) => {
            (0, auction_data_paths_1.assertPathWithinRoot)(targetPath, rootPath);
            if (!fs_1.default.existsSync(targetPath))
                return;
            const stats = fs_1.default.statSync(targetPath);
            if (stats.isDirectory()) {
                bytesRemoved += (0, auction_download_size_1.calculateDownloadPackageSizeBytes)(targetPath);
                fs_1.default.rmSync(targetPath, { recursive: true, force: true });
                foldersRemoved += 1;
                return;
            }
            bytesRemoved += stats.size;
            fs_1.default.unlinkSync(targetPath);
            filesRemoved += 1;
        };
        if (fs_1.default.existsSync(projectRoot)) {
            for (const entry of fs_1.default.readdirSync(projectRoot, { withFileTypes: true })) {
                const targetPath = path_1.default.join(projectRoot, entry.name);
                if (entry.isDirectory() || (entry.isFile() && entry.name.toLowerCase().endsWith(".json"))) {
                    removeTarget(targetPath, projectRoot);
                }
            }
        }
        if (fs_1.default.existsSync(legacyRoot) && legacyRoot !== projectRoot) {
            for (const entry of fs_1.default.readdirSync(legacyRoot, { withFileTypes: true })) {
                if (entry.name === (0, auction_data_paths_1.sanitizeProjectSlug)(projectSlug)) {
                    continue;
                }
                if (!(0, auction_data_paths_1.matchesProjectDownloadEntry)(entry.name, projectSlug)) {
                    continue;
                }
                const targetPath = path_1.default.join(legacyRoot, entry.name);
                if (entry.isDirectory() || (entry.isFile() && entry.name.toLowerCase().endsWith(".json"))) {
                    removeTarget(targetPath, legacyRoot);
                }
            }
        }
        fs_1.default.mkdirSync(projectRoot, { recursive: true });
        this.clearDownloadReference(projectId);
        return { ok: true, foldersRemoved, filesRemoved, bytesRemoved };
    }
}
exports.AuctionDatasetService = AuctionDatasetService;
