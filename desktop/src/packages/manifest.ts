import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  PROJECT_PACKAGE_MANIFEST_KIND,
  PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION,
  type ProjectPackageManifest,
} from "./types";

export class ProjectPackageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectPackageValidationError";
  }
}

export function isIntegerPackageVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function parseProjectPackageManifest(raw: unknown): ProjectPackageManifest {
  if (!raw || typeof raw !== "object") {
    throw new ProjectPackageValidationError("Package manifest must be an object.");
  }
  const value = raw as Record<string, unknown>;

  if (value.kind !== PROJECT_PACKAGE_MANIFEST_KIND) {
    throw new ProjectPackageValidationError(
      `Unsupported package kind: ${String(value.kind)}`,
    );
  }
  if (value.schemaVersion !== PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION) {
    throw new ProjectPackageValidationError(
      `Unsupported package schemaVersion: ${String(value.schemaVersion)}`,
    );
  }
  if (typeof value.projectKey !== "string" || !value.projectKey.trim()) {
    throw new ProjectPackageValidationError("Package projectKey is required.");
  }
  if (typeof value.projectSlug !== "string" || !value.projectSlug.trim()) {
    throw new ProjectPackageValidationError("Package projectSlug is required.");
  }
  if (typeof value.projectName !== "string" || !value.projectName.trim()) {
    throw new ProjectPackageValidationError("Package projectName is required.");
  }
  if (typeof value.projectType !== "string" || !value.projectType.trim()) {
    throw new ProjectPackageValidationError("Package projectType is required.");
  }
  if (!isIntegerPackageVersion(value.packageVersion)) {
    throw new ProjectPackageValidationError(
      "Package packageVersion must be a positive integer (v1, v2, …).",
    );
  }
  if (!Array.isArray(value.displays)) {
    throw new ProjectPackageValidationError("Package displays must be an array.");
  }
  if (!value.files || typeof value.files !== "object") {
    throw new ProjectPackageValidationError("Package files map is required.");
  }
  if (!value.integrity || typeof value.integrity !== "object") {
    throw new ProjectPackageValidationError("Package integrity block is required.");
  }
  const integrity = value.integrity as Record<string, unknown>;
  if (!integrity.files || typeof integrity.files !== "object") {
    throw new ProjectPackageValidationError("Package integrity.files map is required.");
  }

  return value as unknown as ProjectPackageManifest;
}

export function hashFileSha256(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export function hashBufferSha256(contents: Buffer | string): string {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

export function hashManifestCanonical(manifest: ProjectPackageManifest): string {
  const clone: ProjectPackageManifest = {
    ...manifest,
    integrity: {
      ...manifest.integrity,
      manifestHash: undefined,
    },
  };
  return hashBufferSha256(JSON.stringify(clone));
}

export function validateInstalledPackageDirectory(
  packageRoot: string,
  expected: {
    projectSlug: string;
    packageVersion: number;
  },
): ProjectPackageManifest {
  const manifestPath = path.join(packageRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new ProjectPackageValidationError("Package manifest.json is missing.");
  }

  const manifest = parseProjectPackageManifest(
    JSON.parse(fs.readFileSync(manifestPath, "utf8")),
  );

  if (manifest.projectSlug !== expected.projectSlug) {
    throw new ProjectPackageValidationError(
      `Package slug mismatch: expected ${expected.projectSlug}, got ${manifest.projectSlug}.`,
    );
  }
  if (manifest.packageVersion !== expected.packageVersion) {
    throw new ProjectPackageValidationError(
      `Package version mismatch: expected v${expected.packageVersion}, got v${manifest.packageVersion}.`,
    );
  }

  for (const [relativePath, expectedHash] of Object.entries(manifest.integrity.files)) {
    const absolutePath = path.join(packageRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new ProjectPackageValidationError(`Missing package file: ${relativePath}`);
    }
    const actual = hashFileSha256(absolutePath);
    if (actual !== expectedHash) {
      throw new ProjectPackageValidationError(
        `Integrity hash mismatch for ${relativePath}.`,
      );
    }
  }

  for (const display of manifest.displays) {
    const htmlAbsolute = path.join(packageRoot, display.htmlPath);
    if (!fs.existsSync(htmlAbsolute)) {
      throw new ProjectPackageValidationError(
        `Display HTML missing for ${display.key}: ${display.htmlPath}`,
      );
    }
  }

  const computedManifestHash = hashManifestCanonical(manifest);
  if (
    manifest.integrity.manifestHash &&
    manifest.integrity.manifestHash !== computedManifestHash
  ) {
    throw new ProjectPackageValidationError("Package manifest hash mismatch.");
  }

  return manifest;
}

export function buildManifestFileMap(
  packageRoot: string,
  relativePaths: string[],
): { files: Record<string, string>; integrityFiles: Record<string, string> } {
  const files: Record<string, string> = {};
  const integrityFiles: Record<string, string> = {};
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(packageRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new ProjectPackageValidationError(`Cannot hash missing file: ${relativePath}`);
    }
    files[relativePath] = relativePath;
    integrityFiles[relativePath] = hashFileSha256(absolutePath);
  }
  return { files, integrityFiles };
}
