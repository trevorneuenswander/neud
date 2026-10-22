import fs from "fs";
import path from "path";
import type { AppPaths } from "../services/app-paths";
import {
  ensureProjectPackageDirs,
  getProjectPackageStagingDir,
  getProjectPackageVersionDir,
  writeCurrentPackagePointer,
} from "./project-package-paths";
import {
  ProjectPackageValidationError,
  hashManifestCanonical,
  parseProjectPackageManifest,
  validateInstalledPackageDirectory,
} from "./manifest";
import type { ProjectPackageManifest } from "./types";

function rmrf(target: string): void {
  if (!fs.existsSync(target)) {
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDirRecursive(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

export type StagedPackageActivation = {
  projectId: string;
  packageRoot: string;
  manifest: ProjectPackageManifest;
  previousVersion: number | null;
};

/**
 * Atomic package activation:
 * 1. Validate staged directory
 * 2. Move staging → version dir (or replace version dir atomically via rename)
 * 3. Write current pointer
 *
 * Previous version directory is retained for rollback.
 */
export class ProjectPackageStore {
  constructor(private readonly paths: AppPaths) {}

  stageFromDirectory(
    projectId: string,
    version: number,
    sourceDirectory: string,
  ): string {
    ensureProjectPackageDirs(this.paths, projectId);
    const staging = getProjectPackageStagingDir(this.paths, projectId, version);
    rmrf(staging);
    copyDirRecursive(sourceDirectory, staging);
    return staging;
  }

  writeStagingManifest(
    projectId: string,
    version: number,
    manifest: ProjectPackageManifest,
  ): string {
    const staging = getProjectPackageStagingDir(this.paths, projectId, version);
    fs.mkdirSync(staging, { recursive: true });
    const withHash: ProjectPackageManifest = {
      ...manifest,
      integrity: {
        ...manifest.integrity,
        manifestHash: hashManifestCanonical(manifest),
      },
    };
    fs.writeFileSync(
      path.join(staging, "manifest.json"),
      `${JSON.stringify(withHash, null, 2)}\n`,
      "utf8",
    );
    return staging;
  }

  activateStagedPackage(input: {
    projectId: string;
    projectSlug: string;
    version: number;
    previousVersion?: number | null;
  }): StagedPackageActivation {
    const staging = getProjectPackageStagingDir(
      this.paths,
      input.projectId,
      input.version,
    );
    if (!fs.existsSync(staging)) {
      throw new ProjectPackageValidationError(
        `Staged package missing for v${input.version}.`,
      );
    }

    const manifest = validateInstalledPackageDirectory(staging, {
      projectSlug: input.projectSlug,
      packageVersion: input.version,
    });

    const versionDir = getProjectPackageVersionDir(
      this.paths,
      input.projectId,
      input.version,
    );
    const swapDir = `${versionDir}.activating`;
    rmrf(swapDir);
    fs.renameSync(staging, swapDir);

    if (fs.existsSync(versionDir)) {
      const backup = `${versionDir}.bak`;
      rmrf(backup);
      fs.renameSync(versionDir, backup);
      try {
        fs.renameSync(swapDir, versionDir);
        rmrf(backup);
      } catch (error) {
        if (fs.existsSync(backup) && !fs.existsSync(versionDir)) {
          fs.renameSync(backup, versionDir);
        }
        rmrf(swapDir);
        throw error;
      }
    } else {
      fs.renameSync(swapDir, versionDir);
    }

    const activatedAt = new Date().toISOString();
    writeCurrentPackagePointer(this.paths, input.projectId, {
      version: input.version,
      activatedAt,
      packageRoot: versionDir,
    });

    return {
      projectId: input.projectId,
      packageRoot: versionDir,
      manifest: parseProjectPackageManifest(
        JSON.parse(fs.readFileSync(path.join(versionDir, "manifest.json"), "utf8")),
      ),
      previousVersion: input.previousVersion ?? null,
    };
  }

  removePackageFiles(
    projectId: string,
    options?: { keepRetainedData?: boolean; keepPreviousVersion?: number | null },
  ): void {
    const packagesRoot = path.join(this.paths.projects, projectId, "packages");
    if (!fs.existsSync(packagesRoot)) {
      return;
    }

    if (options?.keepPreviousVersion != null) {
      for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          if (entry.name === "current.json") {
            fs.unlinkSync(path.join(packagesRoot, entry.name));
          }
          continue;
        }
        const match = /^v(\d+)$/.exec(entry.name);
        if (!match) {
          rmrf(path.join(packagesRoot, entry.name));
          continue;
        }
        const version = Number(match[1]);
        if (version !== options.keepPreviousVersion) {
          rmrf(path.join(packagesRoot, entry.name));
        }
      }
      return;
    }

    rmrf(packagesRoot);
    // retained-data intentionally preserved unless explicit destructive cleanup
    void options?.keepRetainedData;
  }

  getActivePackageRoot(projectId: string, version: number): string {
    return getProjectPackageVersionDir(this.paths, projectId, version);
  }
}
