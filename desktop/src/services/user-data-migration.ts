import fs from "fs";
import path from "path";
import { app } from "electron";
import { NEUD_APP_DATA_DIR } from "../env/neud-env";

const LEGACY_USER_DATA_FOLDER_NAMES = [
  "HMG Graphics Server",
  "hmg-graphics-server",
  "Electron",
] as const;

const NEUD_USER_DATA_FOLDER = "NEUD";

/**
 * Resolve NEUD userData and migrate one-time from legacy folders when empty.
 */
export function configureUserDataPath(): void {
  const explicit = NEUD_APP_DATA_DIR();
  if (explicit) {
    fs.mkdirSync(explicit, { recursive: true });
    app.setPath("userData", explicit);
    return;
  }

  const appDataRoot = app.getPath("appData");
  const neudPath = path.join(appDataRoot, NEUD_USER_DATA_FOLDER);

  if (hasExistingNeudData(neudPath)) {
    app.setPath("userData", neudPath);
    return;
  }

  for (const legacyFolder of LEGACY_USER_DATA_FOLDER_NAMES) {
    const legacyPath = path.join(appDataRoot, legacyFolder);
    if (!fs.existsSync(legacyPath)) {
      continue;
    }

    migrateLegacyUserData(legacyPath, neudPath);
    app.setPath("userData", neudPath);
    console.info(
      `[UserDataMigration] source=${legacyFolder} target=${NEUD_USER_DATA_FOLDER} status=success`,
    );
    return;
  }

  fs.mkdirSync(neudPath, { recursive: true });
  app.setPath("userData", neudPath);
}

function hasExistingNeudData(userDataPath: string): boolean {
  const markers = [
    path.join(userDataPath, "data", "neud.sqlite"),
    path.join(userDataPath, "data", "hmg-graphics.sqlite"),
    path.join(userDataPath, "config", "host.json"),
    path.join(userDataPath, "config", "auth-cache.enc"),
  ];

  return markers.some((marker) => fs.existsSync(marker));
}

function migrateLegacyUserData(sourceRoot: string, targetRoot: string): void {
  if (sourceRoot === targetRoot) {
    return;
  }

  fs.mkdirSync(targetRoot, { recursive: true });
  copyDirectoryContents(sourceRoot, targetRoot);
}

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
