import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { app } from "electron";
import type { AppPaths } from "./app-paths";

export type ResolvedDataEngineModule = {
  absolutePath: string;
  moduleUrl: string;
  workerRoot: string;
};

function getDataEngineRoot(paths: AppPaths): string {
  if (app.isPackaged) {
    return path.join(paths.repoRoot, "worker");
  }
  return path.join(paths.repoRoot, "workers", "data-engine");
}

/**
 * Resolve a compiled worker module under data-engine/dist/.
 * Prefers dist over src so packaged and dev builds share the same import path.
 */
export function resolveDataEngineDistModule(
  paths: AppPaths,
  relativePath: string,
): ResolvedDataEngineModule {
  const workerRoot = getDataEngineRoot(paths);
  const absolutePath = path.join(workerRoot, "dist", relativePath);
  return {
    absolutePath,
    moduleUrl: pathToFileURL(absolutePath).href,
    workerRoot,
  };
}

export function resolveBagLotDetailAdapterPath(
  paths: AppPaths,
): ResolvedDataEngineModule {
  return resolveDataEngineDistModule(paths, path.join("adapters", "bag-lot-detail-page.js"));
}

export function assertDataEngineModuleExists(resolved: ResolvedDataEngineModule): void {
  if (!fs.existsSync(resolved.absolutePath)) {
    throw new Error(
      `BAG lot-detail adapter not found at ${resolved.absolutePath}. ` +
        "Run the data-engine build (npm run build in workers/data-engine) before exporting.",
    );
  }
}
