"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateLegacyDatabaseFile = migrateLegacyDatabaseFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LEGACY_DATABASE_FILENAME = "hmg-graphics.sqlite";
const CURRENT_DATABASE_FILENAME = "neud.sqlite";
function migrateLegacyDatabaseFile(input) {
    const targetPath = path_1.default.join(input.dataDir, CURRENT_DATABASE_FILENAME);
    const legacyPath = path_1.default.join(input.dataDir, LEGACY_DATABASE_FILENAME);
    if (fs_1.default.existsSync(targetPath)) {
        return { migrated: false, backupPath: null };
    }
    if (!fs_1.default.existsSync(legacyPath)) {
        return { migrated: false, backupPath: null };
    }
    fs_1.default.mkdirSync(input.backupsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path_1.default.join(input.backupsDir, `pre-rename-${LEGACY_DATABASE_FILENAME}-${timestamp}.sqlite`);
    fs_1.default.copyFileSync(legacyPath, backupPath);
    const legacySize = fs_1.default.statSync(legacyPath).size;
    if (legacySize <= 0) {
        throw new Error("Legacy database file is empty; rename aborted.");
    }
    fs_1.default.copyFileSync(legacyPath, targetPath);
    const targetSize = fs_1.default.statSync(targetPath).size;
    if (targetSize !== legacySize) {
        fs_1.default.unlinkSync(targetPath);
        throw new Error("Renamed database size mismatch; rename rolled back.");
    }
    fs_1.default.unlinkSync(legacyPath);
    console.info(`[DatabaseRename] source=${LEGACY_DATABASE_FILENAME} target=${CURRENT_DATABASE_FILENAME} status=success backup=${backupPath}`);
    return { migrated: true, backupPath };
}
