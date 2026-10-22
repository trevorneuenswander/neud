/**
 * Owner/Admin project-package publication workflow (v0.3.0).
 *
 * Publishing a package version is explicit and independent from NEUD app releases.
 * Operators cannot publish project code packages.
 *
 * Workflow:
 * 1. Build package directory (manifest + display HTML/assets + hashes)
 * 2. Validate package (manifest, integrity, display HTML present)
 * 3. Publish as next integer version (vN+1) to NEUD cloud project distribution
 * 4. Record activity; clients show Update Available until operator clicks Update
 */

import { buildBroadArrowPackageV1 } from "./broad-arrow-package-builder";
import { buildSemaPackageV1 } from "./sema-package-builder";
import {
  ProjectPackageValidationError,
  validateInstalledPackageDirectory,
} from "./manifest";
import { getBuiltinCatalogEntry } from "./builtin-package-catalog";
import type { ProjectPackageManifest } from "./types";

export type PackagePublishPreview = {
  projectSlug: string;
  workingVersion: number;
  nextPublishVersion: number;
  manifest: ProjectPackageManifest;
};

export function previewNextPackageVersion(
  projectSlug: string,
  installedVersion: number | null,
  availableVersion: number | null,
): number {
  const catalog = getBuiltinCatalogEntry(projectSlug);
  const baseline = Math.max(
    installedVersion ?? 0,
    availableVersion ?? 0,
    catalog?.availableVersion ?? 0,
  );
  return baseline + 1;
}

export function buildBuiltinPackageToDirectory(
  projectSlug: string,
  outputDirectory: string,
): ProjectPackageManifest {
  if (projectSlug === "broad-arrow-auctions") {
    return buildBroadArrowPackageV1(outputDirectory);
  }
  if (projectSlug === "sema") {
    return buildSemaPackageV1(outputDirectory);
  }
  throw new ProjectPackageValidationError(`No package builder for ${projectSlug}`);
}

export function validatePackageDirectoryForPublish(
  packageRoot: string,
  projectSlug: string,
  packageVersion: number,
): ProjectPackageManifest {
  return validateInstalledPackageDirectory(packageRoot, {
    projectSlug,
    packageVersion,
  });
}
