import fs from "fs";
import path from "path";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import {
  assertPathWithinRoot,
  DOWNLOAD_COMPLETE_MARKER,
  getAuctionDataDirectory,
  getProjectAuctionDataDirectory,
  isCompleteDownloadFolder,
  isPartialDownloadFolder,
  listProjectDownloadRoots,
  matchesProjectDownloadEntry,
  resolveAuctionJsonPathInPackage,
  resolveUniquePartialDownloadPackage,
  sanitizeProjectSlug,
} from "./auction-data-paths";
import {
  calculateDownloadPackageSizeBytes,
  formatDownloadSize,
} from "./auction-download-size";
import type {
  AuctionDownloadEntry,
  ClearDownloadsResult,
  OfflineAuctionJsonExport,
} from "./offline-auction-types";

export type AuctionDatasetSource = "downloaded" | "loaded" | "live-snapshot" | "none";

export type AuctionDatasetReference = {
  source: AuctionDatasetSource;
  filePath?: string;
  filename?: string;
  loadedAt: string;
  manualOverride?: boolean;
  totalSizeBytes?: number;
  totalSizeFormatted?: string;
};

export type AuctionDatasetDisplayInfo = {
  reference: AuctionDatasetReference;
  label: string;
  tooltip: string;
  totalSizeBytes?: number;
  totalSizeFormatted?: string;
};

function settingsKey(projectId: string): string {
  return `auctionDataset:${projectId}`;
}

function basenameFromPath(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  return path.basename(filePath);
}

function readDownloadedAt(jsonPath: string, packageDir: string): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as OfflineAuctionJsonExport;
    return parsed.downloadedAt ?? parsed.exportedAt ?? fs.statSync(jsonPath).mtime.toISOString();
  } catch {
    const markerPath = path.join(packageDir, DOWNLOAD_COMPLETE_MARKER);
    if (fs.existsSync(markerPath)) {
      const marker = fs.readFileSync(markerPath, "utf8").trim();
      if (marker) {
        const parsedDate = Date.parse(marker);
        if (Number.isFinite(parsedDate)) {
          return new Date(parsedDate).toISOString();
        }
      }
    }
    return fs.statSync(jsonPath).mtime.toISOString();
  }
}

export class AuctionDatasetService {
  constructor(
    private readonly settings: AppSettingsRepository,
    private readonly projects?: ProjectsRepository,
  ) {}

  getReference(projectId: string): AuctionDatasetReference | null {
    return this.settings.get<AuctionDatasetReference | null>(settingsKey(projectId), null);
  }

  setReference(projectId: string, reference: AuctionDatasetReference): AuctionDatasetReference {
    const totalSizeBytes =
      reference.filePath && reference.filePath !== undefined
        ? calculateDownloadPackageSizeBytes(path.dirname(reference.filePath))
        : reference.totalSizeBytes;
    const normalized: AuctionDatasetReference = {
      ...reference,
      filename: reference.filename ?? basenameFromPath(reference.filePath),
      loadedAt: reference.loadedAt || new Date().toISOString(),
      totalSizeBytes,
      totalSizeFormatted:
        reference.totalSizeFormatted ??
        (typeof totalSizeBytes === "number" ? formatDownloadSize(totalSizeBytes) : undefined),
    };
    this.settings.set(settingsKey(projectId), normalized);
    return normalized;
  }

  setDownloaded(projectId: string, filePath: string): AuctionDatasetReference {
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

  setLoaded(projectId: string, filePath: string): AuctionDatasetReference {
    return this.setReference(projectId, {
      source: "loaded",
      filePath,
      filename: basenameFromPath(filePath),
      loadedAt: new Date().toISOString(),
      manualOverride: true,
    });
  }

  clearDownloadReference(projectId: string): AuctionDatasetReference {
    const cleared: AuctionDatasetReference = {
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

  setLiveSnapshot(projectId: string): AuctionDatasetReference {
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

  clearManualOverride(projectId: string): AuctionDatasetReference | null {
    const existing = this.getReference(projectId);
    if (!existing) return null;
    if (!existing.manualOverride) return existing;
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

  isFileDatasetActive(projectId: string): boolean {
    const reference = this.resolveActiveReference(projectId);
    return reference?.source === "downloaded" || reference?.source === "loaded";
  }

  resolveProjectSlug(projectId: string): string {
    const project = this.projects?.getById(projectId);
    return sanitizeProjectSlug(project?.slug ?? projectId);
  }

  listCompletedDownloads(projectId: string): AuctionDownloadEntry[] {
    const projectSlug = this.resolveProjectSlug(projectId);
    const roots = listProjectDownloadRoots(projectSlug);
    const entries: AuctionDownloadEntry[] = [];

    for (const root of roots) {
      if (!fs.existsSync(root)) continue;

      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || isPartialDownloadFolder(entry.name)) {
          continue;
        }

        const packageDir = path.join(root, entry.name);
        if (!isCompleteDownloadFolder(packageDir)) continue;

        const jsonPath = resolveAuctionJsonPathInPackage(packageDir);
        if (!jsonPath) continue;

        const totalSizeBytes = calculateDownloadPackageSizeBytes(packageDir);
        let lotCount = 0;
        try {
          const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as OfflineAuctionJsonExport;
          lotCount = Array.isArray(parsed.lots) ? parsed.lots.length : 0;
        } catch {
          continue;
        }

        entries.push({
          packageDir,
          jsonPath,
          filename: path.basename(jsonPath),
          downloadedAt: readDownloadedAt(jsonPath, packageDir),
          totalSizeBytes,
          totalSizeFormatted: formatDownloadSize(totalSizeBytes),
          lotCount,
        });
      }

      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
        const jsonPath = path.join(root, entry.name);
        const packageDir = path.dirname(jsonPath);
        if (entries.some((candidate) => candidate.jsonPath === jsonPath)) continue;
        const totalSizeBytes = calculateDownloadPackageSizeBytes(packageDir);
        entries.push({
          packageDir,
          jsonPath,
          filename: entry.name,
          downloadedAt: readDownloadedAt(jsonPath, packageDir),
          totalSizeBytes,
          totalSizeFormatted: formatDownloadSize(totalSizeBytes),
          lotCount: 0,
        });
      }
    }

    entries.sort(
      (left, right) => Date.parse(right.downloadedAt) - Date.parse(left.downloadedAt),
    );
    return entries;
  }

  findMostRecentDownloadFile(projectId?: string): AuctionDownloadEntry | null {
    if (!projectId) {
      const directory = getAuctionDataDirectory();
      if (!fs.existsSync(directory)) return null;
      const legacyEntries: AuctionDownloadEntry[] = [];
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || isPartialDownloadFolder(entry.name)) continue;
        const packageDir = path.join(directory, entry.name);
        if (!isCompleteDownloadFolder(packageDir)) continue;
        const jsonPath = resolveAuctionJsonPathInPackage(packageDir);
        if (!jsonPath) continue;
        legacyEntries.push({
          packageDir,
          jsonPath,
          filename: path.basename(jsonPath),
          downloadedAt: readDownloadedAt(jsonPath, packageDir),
          totalSizeBytes: calculateDownloadPackageSizeBytes(packageDir),
          totalSizeFormatted: formatDownloadSize(calculateDownloadPackageSizeBytes(packageDir)),
          lotCount: 0,
        });
      }
      legacyEntries.sort(
        (left, right) => Date.parse(right.downloadedAt) - Date.parse(left.downloadedAt),
      );
      return legacyEntries[0] ?? null;
    }

    return this.listCompletedDownloads(projectId)[0] ?? null;
  }

  resolveActiveReference(projectId: string): AuctionDatasetReference | null {
    const stored = this.getReference(projectId);
    if (stored?.source === "none") {
      return stored;
    }
    if (stored?.filePath && fs.existsSync(stored.filePath)) {
      const packageDir = path.dirname(stored.filePath);
      const totalSizeBytes = calculateDownloadPackageSizeBytes(packageDir);
      return {
        ...stored,
        totalSizeBytes,
        totalSizeFormatted: formatDownloadSize(totalSizeBytes),
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

  readActiveDataset(projectId: string): Record<string, unknown> | null {
    const reference = this.resolveActiveReference(projectId);
    if (!reference?.filePath || !fs.existsSync(reference.filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(reference.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  getDisplayInfo(projectId: string): AuctionDatasetDisplayInfo {
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

  getActiveDownloadFolder(projectId: string): string | null {
    const reference = this.resolveActiveReference(projectId);
    if (!reference?.filePath) return null;
    return path.dirname(reference.filePath);
  }

  createManualWorkingDownload(projectId: string): {
    packageDir: string;
    jsonPath: string;
  } {
    const project = this.projects?.getById(projectId);
    const projectSlug = sanitizeProjectSlug(project?.slug ?? projectId);
    const projectName = project?.name ?? "Broad Arrow Auctions";
    const paths = resolveUniquePartialDownloadPackage(projectSlug);
    const exportedAt = new Date().toISOString();
    const payload: OfflineAuctionJsonExport = {
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
    fs.writeFileSync(paths.jsonPath, JSON.stringify(payload, null, 2), "utf8");
    return { packageDir: paths.packageDir, jsonPath: paths.jsonPath };
  }

  clearAllDownloads(projectId: string): ClearDownloadsResult {
    const projectSlug = this.resolveProjectSlug(projectId);
    const projectRoot = getProjectAuctionDataDirectory(projectSlug);
    const legacyRoot = getAuctionDataDirectory();

    let foldersRemoved = 0;
    let filesRemoved = 0;
    let bytesRemoved = 0;

    const removeTarget = (targetPath: string, rootPath: string) => {
      assertPathWithinRoot(targetPath, rootPath);
      if (!fs.existsSync(targetPath)) return;

      const stats = fs.statSync(targetPath);
      if (stats.isDirectory()) {
        bytesRemoved += calculateDownloadPackageSizeBytes(targetPath);
        fs.rmSync(targetPath, { recursive: true, force: true });
        foldersRemoved += 1;
        return;
      }

      bytesRemoved += stats.size;
      fs.unlinkSync(targetPath);
      filesRemoved += 1;
    };

    if (fs.existsSync(projectRoot)) {
      for (const entry of fs.readdirSync(projectRoot, { withFileTypes: true })) {
        const targetPath = path.join(projectRoot, entry.name);
        if (entry.isDirectory() || (entry.isFile() && entry.name.toLowerCase().endsWith(".json"))) {
          removeTarget(targetPath, projectRoot);
        }
      }
    }

    if (fs.existsSync(legacyRoot) && legacyRoot !== projectRoot) {
      for (const entry of fs.readdirSync(legacyRoot, { withFileTypes: true })) {
        if (entry.name === sanitizeProjectSlug(projectSlug)) {
          continue;
        }
        if (!matchesProjectDownloadEntry(entry.name, projectSlug)) {
          continue;
        }
        const targetPath = path.join(legacyRoot, entry.name);
        if (entry.isDirectory() || (entry.isFile() && entry.name.toLowerCase().endsWith(".json"))) {
          removeTarget(targetPath, legacyRoot);
        }
      }
    }

    fs.mkdirSync(projectRoot, { recursive: true });
    this.clearDownloadReference(projectId);
    return { ok: true, foldersRemoved, filesRemoved, bytesRemoved };
  }
}
