"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureUserDataPath = configureUserDataPath;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const neud_env_1 = require("../env/neud-env");
const LEGACY_USER_DATA_FOLDER_NAMES = [
    "HMG Graphics Server",
    "hmg-graphics-server",
    "Electron",
];
const NEUD_USER_DATA_FOLDER = "NEUD";
/**
 * Resolve NEUD userData and migrate one-time from legacy folders when empty.
 */
function configureUserDataPath() {
    const explicit = (0, neud_env_1.NEUD_APP_DATA_DIR)();
    if (explicit) {
        fs_1.default.mkdirSync(explicit, { recursive: true });
        electron_1.app.setPath("userData", explicit);
        return;
    }
    const appDataRoot = electron_1.app.getPath("appData");
    const neudPath = path_1.default.join(appDataRoot, NEUD_USER_DATA_FOLDER);
    if (hasExistingNeudData(neudPath)) {
        electron_1.app.setPath("userData", neudPath);
        return;
    }
    for (const legacyFolder of LEGACY_USER_DATA_FOLDER_NAMES) {
        const legacyPath = path_1.default.join(appDataRoot, legacyFolder);
        if (!fs_1.default.existsSync(legacyPath)) {
            continue;
        }
        migrateLegacyUserData(legacyPath, neudPath);
        electron_1.app.setPath("userData", neudPath);
        console.info(`[UserDataMigration] source=${legacyFolder} target=${NEUD_USER_DATA_FOLDER} status=success`);
        return;
    }
    fs_1.default.mkdirSync(neudPath, { recursive: true });
    electron_1.app.setPath("userData", neudPath);
}
function hasExistingNeudData(userDataPath) {
    const markers = [
        path_1.default.join(userDataPath, "data", "neud.sqlite"),
        path_1.default.join(userDataPath, "data", "hmg-graphics.sqlite"),
        path_1.default.join(userDataPath, "config", "host.json"),
        path_1.default.join(userDataPath, "config", "auth-cache.enc"),
    ];
    return markers.some((marker) => fs_1.default.existsSync(marker));
}
function migrateLegacyUserData(sourceRoot, targetRoot) {
    if (sourceRoot === targetRoot) {
        return;
    }
    fs_1.default.mkdirSync(targetRoot, { recursive: true });
    copyDirectoryContents(sourceRoot, targetRoot);
}
function copyDirectoryContents(sourceDir, targetDir) {
    fs_1.default.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs_1.default.readdirSync(sourceDir, { withFileTypes: true })) {
        const sourcePath = path_1.default.join(sourceDir, entry.name);
        const targetPath = path_1.default.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryContents(sourcePath, targetPath);
            continue;
        }
        if (fs_1.default.existsSync(targetPath)) {
            continue;
        }
        fs_1.default.copyFileSync(sourcePath, targetPath);
    }
}
