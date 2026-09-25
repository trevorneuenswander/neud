import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { isPackagedDesktopRuntime } from "./packaged-runtime";

export const BUNDLED_DISPLAY_HTML_FILES = [
  "stream-bid-display-v1.html",
  "stream-ticker-v1.html",
  "led-display-quail-v1.html",
  "legacy-pylon-v1.html",
  "auction-ticker-overlay-v1.html",
  "auction-pylon-display-v1.html",
  "auction-ticker-legacy-live-v1-2026-07-26-132400.html",
] as const;

export type BundledDisplayHtmlFileName = (typeof BUNDLED_DISPLAY_HTML_FILES)[number];

function assertSafeBundledDisplayFileName(fileName: string): void {
  if (
    !fileName ||
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("\0")
  ) {
    throw new Error(`Invalid bundled display file name: ${fileName}`);
  }
}

function packagedBundledDisplayDir(): string {
  return path.join(app.getAppPath(), "dist", "displays", "bundled");
}

function developmentBundledDisplayCandidates(fileName: string): string[] {
  const fromCompiledLib = path.resolve(__dirname, "..", "displays", "bundled", fileName);
  const fromSourceTree = path.resolve(
    __dirname,
    "..",
    "..",
    "src",
    "displays",
    "bundled",
    fileName,
  );

  return [fromCompiledLib, fromSourceTree];
}

export function resolveBundledDisplaySourcePath(fileName: string): string {
  assertSafeBundledDisplayFileName(fileName);

  if (
    !BUNDLED_DISPLAY_HTML_FILES.includes(fileName as BundledDisplayHtmlFileName)
  ) {
    throw new Error(
      `Unknown bundled display source "${fileName}". Allowed: ${BUNDLED_DISPLAY_HTML_FILES.join(", ")}`,
    );
  }

  if (isPackagedDesktopRuntime()) {
    return path.join(packagedBundledDisplayDir(), fileName);
  }

  for (const candidate of developmentBundledDisplayCandidates(fileName)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return developmentBundledDisplayCandidates(fileName)[0] ?? path.join(
    packagedBundledDisplayDir(),
    fileName,
  );
}

function createMissingBundledDisplayError(fileName: string, resolvedPath: string): Error {
  return new Error(
    [
      "Bundled display source not found.",
      `File: ${fileName}`,
      `Resolved path: ${resolvedPath}`,
      `Packaged: ${String(isPackagedDesktopRuntime())}`,
      `app.isPackaged: ${String(app.isPackaged)}`,
      `Version: ${app.getVersion()}`,
    ].join("\n"),
  );
}

export function readBundledDisplaySource(fileName: string): string {
  const resolvedPath = resolveBundledDisplaySourcePath(fileName);
  if (!fs.existsSync(resolvedPath)) {
    throw createMissingBundledDisplayError(fileName, resolvedPath);
  }

  const contents = fs.readFileSync(resolvedPath, "utf8");
  if (!contents.trim()) {
    throw createMissingBundledDisplayError(fileName, resolvedPath);
  }

  return contents;
}

export function resolveBundledDisplaySourcePathFromReference(referencePath: string): string {
  return resolveBundledDisplaySourcePath(path.basename(referencePath));
}

export function readBundledDisplaySourceFromReference(referencePath: string): string {
  return readBundledDisplaySource(path.basename(referencePath));
}

export function validateBundledDisplaySources(): void {
  const missing: string[] = [];

  for (const fileName of BUNDLED_DISPLAY_HTML_FILES) {
    const resolvedPath = resolveBundledDisplaySourcePath(fileName);
    if (!fs.existsSync(resolvedPath)) {
      missing.push(`${fileName} -> ${resolvedPath}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      [
        "Missing required bundled display HTML sources:",
        ...missing.map((entry) => `  - ${entry}`),
        `Packaged: ${String(isPackagedDesktopRuntime())}`,
        `appPath: ${app.getAppPath()}`,
      ].join("\n"),
    );
  }
}
