import fs from "fs";
import path from "path";
import type { AppPaths } from "../services/app-paths";

export function getProjectPackagesRoot(paths: AppPaths, projectId: string): string {
  return path.join(paths.projects, projectId, "packages");
}

export function getProjectPackageVersionDir(
  paths: AppPaths,
  projectId: string,
  version: number,
): string {
  return path.join(getProjectPackagesRoot(paths, projectId), `v${version}`);
}

export function getProjectPackageStagingDir(
  paths: AppPaths,
  projectId: string,
  version: number,
): string {
  return path.join(getProjectPackagesRoot(paths, projectId), `.staging-v${version}`);
}

export function getProjectPackageCurrentPointerPath(
  paths: AppPaths,
  projectId: string,
): string {
  return path.join(getProjectPackagesRoot(paths, projectId), "current.json");
}

export function getProjectRetainedDataDir(paths: AppPaths, projectId: string): string {
  return path.join(paths.projects, projectId, "retained-data");
}

export type ProjectPackageCurrentPointer = {
  version: number;
  activatedAt: string;
  packageRoot: string;
};

export function readCurrentPackagePointer(
  paths: AppPaths,
  projectId: string,
): ProjectPackageCurrentPointer | null {
  const pointerPath = getProjectPackageCurrentPointerPath(paths, projectId);
  if (!fs.existsSync(pointerPath)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(pointerPath, "utf8")) as ProjectPackageCurrentPointer;
    if (!raw || typeof raw.version !== "number" || typeof raw.packageRoot !== "string") {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function writeCurrentPackagePointer(
  paths: AppPaths,
  projectId: string,
  pointer: ProjectPackageCurrentPointer,
): void {
  const root = getProjectPackagesRoot(paths, projectId);
  fs.mkdirSync(root, { recursive: true });
  const pointerPath = getProjectPackageCurrentPointerPath(paths, projectId);
  const tempPath = `${pointerPath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, pointerPath);
}

export function ensureProjectPackageDirs(paths: AppPaths, projectId: string): void {
  fs.mkdirSync(getProjectPackagesRoot(paths, projectId), { recursive: true });
  fs.mkdirSync(getProjectRetainedDataDir(paths, projectId), { recursive: true });
}
