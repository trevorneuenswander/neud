import fs from "fs";
import path from "path";
import { app } from "electron";

export const DOWNLOAD_COMPLETE_MARKER = ".download-complete";
export const PARTIAL_DOWNLOAD_SUFFIX = ".partial";

export type DownloadPackagePaths = {
  packageDir: string;
  jsonPath: string;
  photosDir: string;
  timestamp: string;
  projectSlug: string;
};

function ensureDirectory(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getAuctionDataDirectory(): string {
  return ensureDirectory(path.join(app.getPath("userData"), "auction-data"));
}

export function getProjectAuctionDataDirectory(projectSlug: string): string {
  const sanitized = sanitizeProjectSlug(projectSlug);
  return ensureDirectory(path.join(getAuctionDataDirectory(), sanitized));
}

export function sanitizeProjectSlug(slug: string): string {
  const trimmed = slug.trim().toLowerCase();
  const sanitized = trimmed.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-");
  return sanitized.replace(/^-+|-+$/g, "") || "project";
}

export function buildDownloadTimestamp(date = new Date()): string {
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
export function buildAuctionExportFileName(date = new Date()): string {
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

export function buildAuctionPackageFolderName(date = new Date()): string {
  return buildAuctionExportFileName(date);
}

export function buildDownloadJsonFileName(projectSlug: string, timestamp: string): string {
  return `${sanitizeProjectSlug(projectSlug)}_${timestamp}.json`;
}

export function isPartialDownloadFolder(folderName: string): boolean {
  return folderName.endsWith(PARTIAL_DOWNLOAD_SUFFIX);
}

export function isCompleteDownloadFolder(packageDir: string): boolean {
  if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) {
    return false;
  }
  if (isPartialDownloadFolder(path.basename(packageDir))) {
    return false;
  }
  if (fs.existsSync(path.join(packageDir, DOWNLOAD_COMPLETE_MARKER))) {
    return true;
  }
  return resolveAuctionJsonPathInPackage(packageDir) !== null;
}

export function buildBroadArrowExportFolderName(projectName: string, date = new Date()): string {
  const sanitized =
    projectName
      .trim()
      .replace(/[^\w\s-]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "Broad-Arrow-Auctions";
  return `${sanitized}-${buildDownloadTimestamp(date)}`;
}

export function resolveUniqueBroadArrowExportPackage(
  projectSlug: string,
  projectName: string,
  date = new Date(),
): DownloadPackagePaths {
  const timestamp = buildDownloadTimestamp(date);
  const projectRoot = getProjectAuctionDataDirectory(projectSlug);
  const folderBase = buildBroadArrowExportFolderName(projectName, date);
  let folderName = `${folderBase}${PARTIAL_DOWNLOAD_SUFFIX}`;
  let packageDir = path.join(projectRoot, folderName);
  let suffix = 2;

  while (fs.existsSync(packageDir)) {
    folderName = `${folderBase}-${suffix}${PARTIAL_DOWNLOAD_SUFFIX}`;
    packageDir = path.join(projectRoot, folderName);
    suffix += 1;
  }

  const photosDir = path.join(packageDir, "photos");
  fs.mkdirSync(photosDir, { recursive: true });

  return {
    packageDir,
    jsonPath: path.join(packageDir, `${folderBase}.json`),
    photosDir,
    timestamp,
    projectSlug: sanitizeProjectSlug(projectSlug),
  };
}

export function resolveUniquePartialDownloadPackage(
  projectSlug: string,
  date = new Date(),
): DownloadPackagePaths {
  const timestamp = buildDownloadTimestamp(date);
  const projectRoot = getProjectAuctionDataDirectory(projectSlug);
  let folderName = `${timestamp}${PARTIAL_DOWNLOAD_SUFFIX}`;
  let packageDir = path.join(projectRoot, folderName);
  let suffix = 2;

  while (fs.existsSync(packageDir)) {
    folderName = `${timestamp}-${suffix}${PARTIAL_DOWNLOAD_SUFFIX}`;
    packageDir = path.join(projectRoot, folderName);
    suffix += 1;
  }

  const photosDir = path.join(packageDir, "photos");
  fs.mkdirSync(photosDir, { recursive: true });

  return {
    packageDir,
    jsonPath: path.join(packageDir, buildDownloadJsonFileName(projectSlug, timestamp)),
    photosDir,
    timestamp,
    projectSlug: sanitizeProjectSlug(projectSlug),
  };
}

export function finalizeDownloadPackage(packageDir: string): string {
  if (!fs.existsSync(packageDir)) {
    throw new Error("Download package directory is missing.");
  }

  const baseName = path.basename(packageDir);
  if (!baseName.endsWith(PARTIAL_DOWNLOAD_SUFFIX)) {
    fs.writeFileSync(path.join(packageDir, DOWNLOAD_COMPLETE_MARKER), new Date().toISOString(), "utf8");
    return packageDir;
  }

  const finalName = baseName.slice(0, -PARTIAL_DOWNLOAD_SUFFIX.length);
  const finalDir = path.join(path.dirname(packageDir), finalName);
  if (fs.existsSync(finalDir)) {
    throw new Error("A completed download folder with the same timestamp already exists.");
  }

  fs.renameSync(packageDir, finalDir);
  fs.writeFileSync(path.join(finalDir, DOWNLOAD_COMPLETE_MARKER), new Date().toISOString(), "utf8");
  return finalDir;
}

export function resolveUniqueAuctionPackageDirectory(directory: string, date = new Date()): string {
  const baseName = buildAuctionPackageFolderName(date);
  let candidate = path.join(directory, baseName);
  let suffix = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${baseName}-${suffix}`);
    suffix += 1;
  }
  return candidate;
}

export function resolveUniqueAuctionExportPath(directory: string, date = new Date()): string {
  const packageDir = resolveUniqueAuctionPackageDirectory(directory, date);
  const baseName = path.basename(packageDir);
  return path.join(packageDir, `${baseName}.json`);
}

export function resolveAuctionJsonPathInPackage(packageDir: string): string | null {
  if (!fs.existsSync(packageDir)) return null;

  const manifestPath = path.join(packageDir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        jsonFileName?: string;
      };
      if (manifest.jsonFileName) {
        const manifestJsonPath = path.join(packageDir, manifest.jsonFileName);
        if (fs.existsSync(manifestJsonPath)) {
          return manifestJsonPath;
        }
      }
    } catch {
      // Fall through to filename heuristics.
    }
  }

  const entries = fs.readdirSync(packageDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase() !== "manifest.json");

  const baseName = path.basename(packageDir);
  const preferred = [
    path.join(packageDir, `${baseName}.json`),
    path.join(packageDir, "auction-data.json"),
    ...jsonFiles.map((name) => path.join(packageDir, name)),
    path.join(packageDir, "auction.json"),
  ];

  for (const candidate of preferred) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (jsonFiles.length === 1) {
    return path.join(packageDir, jsonFiles[0]!);
  }

  return null;
}

export function listProjectDownloadRoots(projectSlug: string): string[] {
  const roots = [getAuctionDataDirectory()];
  const projectRoot = getProjectAuctionDataDirectory(projectSlug);
  if (projectRoot !== roots[0]) {
    roots.push(projectRoot);
  }
  return roots;
}

export function assertPathWithinRoot(targetPath: string, rootPath: string): string {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootPath);
  if (
    resolvedTarget === resolvedRoot ||
    !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error("Unsafe download path.");
  }
  return resolvedTarget;
}

export function matchesProjectDownloadEntry(entryName: string, projectSlug: string): boolean {
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
