/**
 * Deterministic DeckLink SDK tree discovery and validation (no archive execution).
 */
import fs from "node:fs";
import path from "node:path";

export const DECKLINK_DRIVE_FILE_ID = "1iYubcuA0WzlsLG6jilF2nR7_hC2sx-8A";
export const DECKLINK_EXPECTED_VERSION_STRING = "16.0";

const REQUIRED_WIN_IDL = ["DeckLinkAPI.idl", "DeckLinkAPIVersion.h"];
const REQUIRED_WIN_GENERATED = ["DeckLinkAPI.h", "DeckLinkAPIVersion.h"];
const REQUIRED_MAC = ["DeckLinkAPI.h", "DeckLinkAPIVersion.h", "DeckLinkAPIDispatch.cpp"];

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Walk extract root for Win/include/DeckLinkAPI.idl or Mac/include/DeckLinkAPI.h.
 * Rejects ambiguous matches (more than one distinct SDK root).
 */
export function findDeckLinkSdkRoots(extractRoot) {
  const roots = new Map();
  const stack = [path.resolve(extractRoot)];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!isDir(dir)) continue;
    const winIdl = path.join(dir, "Win", "include", "DeckLinkAPI.idl");
    const winHeader = path.join(dir, "Win", "include", "DeckLinkAPI.h");
    const macHeader = path.join(dir, "Mac", "include", "DeckLinkAPI.h");
    if (isFile(winIdl) || isFile(winHeader) || isFile(macHeader)) {
      roots.set(dir, {
        root: dir,
        winInclude: path.join(dir, "Win", "include"),
        macInclude: path.join(dir, "Mac", "include"),
        hasWinIdl: isFile(winIdl),
        hasWinHeader: isFile(winHeader),
        hasMacHeader: isFile(macHeader),
      });
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      stack.push(path.join(dir, entry.name));
    }
  }
  return [...roots.values()];
}

export function assertSingleSdkRoot(extractRoot) {
  const roots = findDeckLinkSdkRoots(extractRoot);
  if (roots.length === 0) {
    throw new Error(
      `No Blackmagic DeckLink SDK root found under ${extractRoot}. ` +
        "Expected Win/include/DeckLinkAPI.idl or Mac/include/DeckLinkAPI.h.",
    );
  }
  if (roots.length > 1) {
    throw new Error(
      `Ambiguous DeckLink SDK layout: found ${roots.length} roots under ${extractRoot}: ` +
        roots.map((r) => r.root).join(", "),
    );
  }
  return roots[0];
}

export function readSdkVersionString(includeDir) {
  const versionHeader = path.join(includeDir, "DeckLinkAPIVersion.h");
  if (!isFile(versionHeader)) return null;
  const text = fs.readFileSync(versionHeader, "utf8");
  const match = text.match(/BLACKMAGIC_DECKLINK_API_VERSION_STRING\s+"([^"]+)"/);
  return match?.[1] ?? null;
}

export function validateWindowsSdkInclude(winInclude, { requireGeneratedHeader = false } = {}) {
  if (!isDir(winInclude)) {
    throw new Error(`Missing Win/include directory: ${winInclude}`);
  }
  const required = requireGeneratedHeader ? REQUIRED_WIN_GENERATED : REQUIRED_WIN_IDL;
  const missing = required.filter((name) => !isFile(path.join(winInclude, name)));
  if (missing.length > 0) {
    throw new Error(`Windows DeckLink SDK incomplete at ${winInclude}. Missing: ${missing.join(", ")}`);
  }
  if (!requireGeneratedHeader && !isFile(path.join(winInclude, "DeckLinkAPI.idl"))) {
    throw new Error(`Missing DeckLinkAPI.idl in ${winInclude}`);
  }
  const version = readSdkVersionString(winInclude);
  if (!version) {
    throw new Error(`Could not read BLACKMAGIC_DECKLINK_API_VERSION_STRING from ${winInclude}`);
  }
  if (!version.startsWith("16.")) {
    throw new Error(
      `Unexpected DeckLink SDK version "${version}" (expected ${DECKLINK_EXPECTED_VERSION_STRING}.x).`,
    );
  }
  return { winInclude, version };
}

export function validateMacSdkInclude(macInclude) {
  if (!isDir(macInclude)) {
    throw new Error(`Missing Mac/include directory: ${macInclude}`);
  }
  const missing = REQUIRED_MAC.filter((name) => !isFile(path.join(macInclude, name)));
  if (missing.length > 0) {
    throw new Error(`macOS DeckLink SDK incomplete at ${macInclude}. Missing: ${missing.join(", ")}`);
  }
  const version = readSdkVersionString(macInclude);
  if (!version) {
    throw new Error(`Could not read BLACKMAGIC_DECKLINK_API_VERSION_STRING from ${macInclude}`);
  }
  return { macInclude, version };
}

export function resolveDeckLinkIncludeForBuild(sdkRoot, platform = process.platform) {
  const root = assertSingleSdkRoot(sdkRoot);
  if (platform === "win32") {
    return validateWindowsSdkInclude(root.winInclude, {
      requireGeneratedHeader: isFile(path.join(root.winInclude, "DeckLinkAPI.h")),
    });
  }
  if (platform === "darwin") {
    return validateMacSdkInclude(root.macInclude);
  }
  throw new Error(`Unsupported platform for DeckLink SDK resolve: ${platform}`);
}
