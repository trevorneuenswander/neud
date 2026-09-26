import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const require = createRequire(path.join(repoRoot, "package.json"));
const asar = require("@electron/asar");

function normalizeAsarEntryPath(entryPath) {
  return String(entryPath).replace(/\\/g, "/").replace(/^\//, "");
}

export function listAsarFiles(asarPath) {
  assertAsarExists(asarPath);
  return asar.listPackage(asarPath).map((entry) => normalizeAsarEntryPath(entry));
}

export function hasAsarFile(asarPath, internalPath) {
  const normalized = normalizeAsarEntryPath(internalPath);
  return listAsarFiles(asarPath).includes(normalized);
}

export function extractAsarEntryToTemp(asarPath, internalPath) {
  assertAsarExists(asarPath);
  const normalized = normalizeAsarEntryPath(internalPath);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neud-asar-extract-"));
  asar.extractAll(asarPath, tempRoot);
  const absolute = path.join(tempRoot, ...normalized.split("/"));
  if (!fs.existsSync(absolute)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw new Error(`Missing ${normalized} in asar archive ${asarPath}`);
  }
  return { tempRoot, absolutePath: absolute };
}

export function requireCommonJsModuleFromAsar(asarPath, internalPath) {
  const { tempRoot, absolutePath } = extractAsarEntryToTemp(asarPath, internalPath);
  try {
    const moduleRequire = createRequire(absolutePath);
    return moduleRequire(absolutePath);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function readAsarFile(asarPath, internalPath) {
  assertAsarExists(asarPath);
  const normalized = normalizeAsarEntryPath(internalPath);

  try {
    const buffer = asar.extractFile(asarPath, normalized);
    if (Buffer.isBuffer(buffer) && buffer.length >= 0) {
      return buffer.toString("utf8");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("was not found in this archive")) {
      throw error;
    }
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neud-asar-read-"));
  try {
    asar.extractAll(asarPath, tempRoot);
    const absolute = path.join(tempRoot, ...normalized.split("/"));
    if (!fs.existsSync(absolute)) {
      throw new Error(`Missing ${normalized} in asar archive ${asarPath}`);
    }
    return fs.readFileSync(absolute, "utf8");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function assertAsarExists(asarPath) {
  if (!fs.existsSync(asarPath)) {
    throw new Error(`Missing app.asar archive: ${asarPath}`);
  }
}

/**
 * Create a minimal asar archive for verifier unit tests (cleaned up after callback).
 */
export async function withTemporaryAsarFixture(files, callback) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neud-asar-fixture-"));
  const srcRoot = path.join(tempRoot, "src");
  fs.mkdirSync(srcRoot, { recursive: true });

  const filenames = [];
  for (const [relativePath, contents] of Object.entries(files)) {
    const normalized = normalizeAsarEntryPath(relativePath);
    const absolute = path.join(srcRoot, normalized);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents, "utf8");
    filenames.push(absolute);
  }

  const archivePath = path.join(tempRoot, "fixture.asar");
  await asar.createPackageFromFiles(srcRoot, archivePath, filenames);

  try {
    return await callback(archivePath);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
