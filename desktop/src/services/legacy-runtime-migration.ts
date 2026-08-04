import fs from "fs";
import os from "os";
import path from "path";
import { app } from "electron";
import type { AppPaths } from "./app-paths";

const LEGACY_USER_DATA_FOLDER_NAMES = [
  "HMG Graphics Server",
  "hmg-graphics-server",
  "Electron",
] as const;

export type LegacyRuntimeMigrationResult = {
  credentialsMigrated: boolean;
  cookiesMigrated: boolean;
  browserDataMigrated: boolean;
  sourceRoot: string | null;
};

function copyDirectoryContents(sourceDir: string, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, targetPath);
      continue;
    }

    if (fs.existsSync(targetPath)) {
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

function resolveAppDataRoot(): string {
  try {
    return app.getPath("appData");
  } catch {
    if (process.platform === "win32") {
      return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    }
    if (process.platform === "darwin") {
      return path.join(os.homedir(), "Library", "Application Support");
    }
    return path.join(os.homedir(), ".config");
  }
}

export function getLegacyUserDataRoots(currentRoot: string): string[] {
  const appDataRoot = resolveAppDataRoot();
  const normalizedCurrent = path.resolve(currentRoot);

  return LEGACY_USER_DATA_FOLDER_NAMES.map((folder) =>
    path.join(appDataRoot, folder),
  ).filter(
    (legacyRoot) =>
      fs.existsSync(legacyRoot) &&
      path.resolve(legacyRoot) !== normalizedCurrent,
  );
}

export function migrateLegacyEngineCookies(
  paths: AppPaths,
  engineId: string,
): LegacyRuntimeMigrationResult {
  const target = path.join(paths.cookies, `${engineId}.json`);
  if (fs.existsSync(target)) {
    return {
      credentialsMigrated: false,
      cookiesMigrated: false,
      browserDataMigrated: false,
      sourceRoot: null,
    };
  }

  for (const legacyRoot of getLegacyUserDataRoots(paths.root)) {
    const legacyFile = path.join(legacyRoot, "cookies", `${engineId}.json`);
    if (!fs.existsSync(legacyFile)) continue;

    fs.mkdirSync(paths.cookies, { recursive: true });
    fs.copyFileSync(legacyFile, target);
    console.info(
      `[LegacyRuntimeMigration] cookies engine=${engineId} source=${legacyFile}`,
    );
    return {
      credentialsMigrated: false,
      cookiesMigrated: true,
      browserDataMigrated: false,
      sourceRoot: legacyRoot,
    };
  }

  return {
    credentialsMigrated: false,
    cookiesMigrated: false,
    browserDataMigrated: false,
    sourceRoot: null,
  };
}

function directoryHasEntries(dirPath: string): boolean {
  return fs.existsSync(dirPath) && fs.readdirSync(dirPath).length > 0;
}

export function migrateLegacyEngineBrowserData(
  paths: AppPaths,
  engineId: string,
): LegacyRuntimeMigrationResult {
  const target = path.join(paths.browserData, engineId);
  if (directoryHasEntries(target)) {
    return {
      credentialsMigrated: false,
      cookiesMigrated: false,
      browserDataMigrated: false,
      sourceRoot: null,
    };
  }

  for (const legacyRoot of getLegacyUserDataRoots(paths.root)) {
    const legacyDir = path.join(legacyRoot, "browser-data", engineId);
    if (!directoryHasEntries(legacyDir)) continue;

    copyDirectoryContents(legacyDir, target);
    console.info(
      `[LegacyRuntimeMigration] browser-data engine=${engineId} source=${legacyDir}`,
    );
    return {
      credentialsMigrated: false,
      cookiesMigrated: false,
      browserDataMigrated: true,
      sourceRoot: legacyRoot,
    };
  }

  return {
    credentialsMigrated: false,
    cookiesMigrated: false,
    browserDataMigrated: false,
    sourceRoot: null,
  };
}

export function migrateLegacyEngineRuntimeAssets(
  paths: AppPaths,
  engineId: string,
): LegacyRuntimeMigrationResult {
  const cookies = migrateLegacyEngineCookies(paths, engineId);
  const browserData = migrateLegacyEngineBrowserData(paths, engineId);

  return {
    credentialsMigrated: false,
    cookiesMigrated: cookies.cookiesMigrated,
    browserDataMigrated: browserData.browserDataMigrated,
    sourceRoot: cookies.sourceRoot ?? browserData.sourceRoot,
  };
}
