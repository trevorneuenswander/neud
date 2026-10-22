/**
 * NEUD downloadable project packages use integer versions (v1, v2, …),
 * independent of the NEUD application semver.
 */

export const PROJECT_PACKAGE_MANIFEST_KIND = "neud-project-package" as const;
export const PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION = 1 as const;

export type ProjectPackageInstallState =
  | "not_downloaded"
  | "downloading"
  | "installed"
  | "updating"
  | "error";

export type ProjectPackageDisplayDefinition = {
  key: string;
  name: string;
  slug: string;
  width: number;
  height: number;
  aspectRatio?: string;
  runtimeAdapterKey?: string;
  htmlPath: string;
  assetPaths?: string[];
};

export type ProjectPackageModuleDefinition = {
  key: string;
  label: string;
  routeSegment: string;
};

export type ProjectPackageManifest = {
  kind: typeof PROJECT_PACKAGE_MANIFEST_KIND;
  schemaVersion: typeof PROJECT_PACKAGE_MANIFEST_SCHEMA_VERSION;
  projectKey: string;
  projectSlug: string;
  projectName: string;
  projectType: string;
  packageVersion: number;
  minimumNeudVersion?: string;
  description?: string;
  modules?: ProjectPackageModuleDefinition[];
  displays: ProjectPackageDisplayDefinition[];
  sourceAdapters?: Array<{ key: string; label: string; adapterType: string }>;
  files: Record<string, string>;
  integrity: {
    manifestHash?: string;
    files: Record<string, string>;
  };
  installHooks?: {
    onFirstInstall?: string[];
    onUpdate?: string[];
  };
};

export type ProjectPackageInstallRecord = {
  projectId: string;
  projectSlug: string;
  projectType: string;
  installedVersion: number;
  previousVersion: number | null;
  availableVersion: number | null;
  installState: ProjectPackageInstallState;
  packageRoot: string;
  manifest: ProjectPackageManifest | null;
  manifestHash: string | null;
  lastError: string | null;
  installedAt: string;
  updatedAt: string;
};

export type ProjectPackageDirectoryEntry = {
  cloudProjectId: string;
  localProjectId: string | null;
  slug: string;
  name: string;
  projectType: string;
  availableVersion: number;
  minimumNeudVersion: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

export type ProjectPackageCardState =
  | "not_downloaded"
  | "downloaded"
  | "update_available"
  | "downloading"
  | "updating"
  | "error";

export type ProjectPackageDirectoryItem = {
  slug: string;
  name: string;
  projectType: string;
  cloudProjectId: string | null;
  localProjectId: string | null;
  installedVersion: number | null;
  availableVersion: number | null;
  packageState: ProjectPackageCardState;
  lastError: string | null;
  description: string | null;
  isInstalled: boolean;
  canOpen: boolean;
  /** Authoritative directory/package metadata timestamp when known. */
  updatedAt: string | null;
};
