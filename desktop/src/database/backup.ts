import fs from "fs";
import path from "path";
import type { AppPaths } from "../services/app-paths";

const MAX_BACKUPS = 10;

export function backupDatabase(paths: AppPaths, reason: string): string {
  if (!fs.existsSync(paths.databaseFile)) {
    throw new Error("Database file does not exist yet; nothing to back up.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeReason = reason.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40);
  const filename = `neud-${timestamp}-${safeReason}.sqlite`;
  const destination = path.join(paths.backups, filename);

  fs.copyFileSync(paths.databaseFile, destination);
  rotateBackups(paths.backups);
  return destination;
}

function rotateBackups(backupsDir: string) {
  const files = fs
    .readdirSync(backupsDir)
    .filter((name) => name.endsWith(".sqlite"))
    .map((name) => ({
      name,
      fullPath: path.join(backupsDir, name),
      mtime: fs.statSync(path.join(backupsDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(MAX_BACKUPS)) {
    fs.unlinkSync(file.fullPath);
  }
}
