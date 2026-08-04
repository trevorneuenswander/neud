"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLegacyUserDataRoots = getLegacyUserDataRoots;
exports.migrateLegacyEngineCookies = migrateLegacyEngineCookies;
exports.migrateLegacyEngineBrowserData = migrateLegacyEngineBrowserData;
exports.migrateLegacyEngineRuntimeAssets = migrateLegacyEngineRuntimeAssets;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const LEGACY_USER_DATA_FOLDER_NAMES = [
    "HMG Graphics Server",
    "hmg-graphics-server",
    "Electron",
];
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
function resolveAppDataRoot() {
    try {
        return electron_1.app.getPath("appData");
    }
    catch {
        if (process.platform === "win32") {
            return process.env.APPDATA || path_1.default.join(os_1.default.homedir(), "AppData", "Roaming");
        }
        if (process.platform === "darwin") {
            return path_1.default.join(os_1.default.homedir(), "Library", "Application Support");
        }
        return path_1.default.join(os_1.default.homedir(), ".config");
    }
}
function getLegacyUserDataRoots(currentRoot) {
    const appDataRoot = resolveAppDataRoot();
    const normalizedCurrent = path_1.default.resolve(currentRoot);
    return LEGACY_USER_DATA_FOLDER_NAMES.map((folder) => path_1.default.join(appDataRoot, folder)).filter((legacyRoot) => fs_1.default.existsSync(legacyRoot) &&
        path_1.default.resolve(legacyRoot) !== normalizedCurrent);
}
function migrateLegacyEngineCookies(paths, engineId) {
    const target = path_1.default.join(paths.cookies, `${engineId}.json`);
    if (fs_1.default.existsSync(target)) {
        return {
            credentialsMigrated: false,
            cookiesMigrated: false,
            browserDataMigrated: false,
            sourceRoot: null,
        };
    }
    for (const legacyRoot of getLegacyUserDataRoots(paths.root)) {
        const legacyFile = path_1.default.join(legacyRoot, "cookies", `${engineId}.json`);
        if (!fs_1.default.existsSync(legacyFile))
            continue;
        fs_1.default.mkdirSync(paths.cookies, { recursive: true });
        fs_1.default.copyFileSync(legacyFile, target);
        console.info(`[LegacyRuntimeMigration] cookies engine=${engineId} source=${legacyFile}`);
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
function directoryHasEntries(dirPath) {
    return fs_1.default.existsSync(dirPath) && fs_1.default.readdirSync(dirPath).length > 0;
}
function migrateLegacyEngineBrowserData(paths, engineId) {
    const target = path_1.default.join(paths.browserData, engineId);
    if (directoryHasEntries(target)) {
        return {
            credentialsMigrated: false,
            cookiesMigrated: false,
            browserDataMigrated: false,
            sourceRoot: null,
        };
    }
    for (const legacyRoot of getLegacyUserDataRoots(paths.root)) {
        const legacyDir = path_1.default.join(legacyRoot, "browser-data", engineId);
        if (!directoryHasEntries(legacyDir))
            continue;
        copyDirectoryContents(legacyDir, target);
        console.info(`[LegacyRuntimeMigration] browser-data engine=${engineId} source=${legacyDir}`);
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
function migrateLegacyEngineRuntimeAssets(paths, engineId) {
    const cookies = migrateLegacyEngineCookies(paths, engineId);
    const browserData = migrateLegacyEngineBrowserData(paths, engineId);
    return {
        credentialsMigrated: false,
        cookiesMigrated: cookies.cookiesMigrated,
        browserDataMigrated: browserData.browserDataMigrated,
        sourceRoot: cookies.sourceRoot ?? browserData.sourceRoot,
    };
}
