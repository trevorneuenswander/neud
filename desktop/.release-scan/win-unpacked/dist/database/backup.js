"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backupDatabase = backupDatabase;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const MAX_BACKUPS = 10;
function backupDatabase(paths, reason) {
    if (!fs_1.default.existsSync(paths.databaseFile)) {
        throw new Error("Database file does not exist yet; nothing to back up.");
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeReason = reason.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40);
    const filename = `neud-${timestamp}-${safeReason}.sqlite`;
    const destination = path_1.default.join(paths.backups, filename);
    fs_1.default.copyFileSync(paths.databaseFile, destination);
    rotateBackups(paths.backups);
    return destination;
}
function rotateBackups(backupsDir) {
    const files = fs_1.default
        .readdirSync(backupsDir)
        .filter((name) => name.endsWith(".sqlite"))
        .map((name) => ({
        name,
        fullPath: path_1.default.join(backupsDir, name),
        mtime: fs_1.default.statSync(path_1.default.join(backupsDir, name)).mtimeMs,
    }))
        .sort((a, b) => b.mtime - a.mtime);
    for (const file of files.slice(MAX_BACKUPS)) {
        fs_1.default.unlinkSync(file.fullPath);
    }
}
