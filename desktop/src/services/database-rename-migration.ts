import fs from "fs";
import path from "path";

const LEGACY_DATABASE_FILENAME = "hmg-graphics.sqlite";
const CURRENT_DATABASE_FILENAME = "neud.sqlite";

export function migrateLegacyDatabaseFile(input: {
  dataDir: string;
  backupsDir: string;
}): { migrated: boolean; backupPath: string | null } {
  const targetPath = path.join(input.dataDir, CURRENT_DATABASE_FILENAME);
  const legacyPath = path.join(input.dataDir, LEGACY_DATABASE_FILENAME);

  if (fs.existsSync(targetPath)) {
    return { migrated: false, backupPath: null };
  }

  if (!fs.existsSync(legacyPath)) {
    return { migrated: false, backupPath: null };
  }

  fs.mkdirSync(input.backupsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    input.backupsDir,
    `pre-rename-${LEGACY_DATABASE_FILENAME}-${timestamp}.sqlite`,
  );

  fs.copyFileSync(legacyPath, backupPath);

  const legacySize = fs.statSync(legacyPath).size;
  if (legacySize <= 0) {
    throw new Error("Legacy database file is empty; rename aborted.");
  }

  fs.copyFileSync(legacyPath, targetPath);
  const targetSize = fs.statSync(targetPath).size;
  if (targetSize !== legacySize) {
    fs.unlinkSync(targetPath);
    throw new Error("Renamed database size mismatch; rename rolled back.");
  }

  fs.unlinkSync(legacyPath);

  console.info(
    `[DatabaseRename] source=${LEGACY_DATABASE_FILENAME} target=${CURRENT_DATABASE_FILENAME} status=success backup=${backupPath}`,
  );

  return { migrated: true, backupPath };
}
