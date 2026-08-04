"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRepoRoot = getRepoRoot;
exports.getAppPaths = getAppPaths;
exports.getWorkerEntryPath = getWorkerEntryPath;
exports.getWorkerCwd = getWorkerCwd;
exports.getHostname = getHostname;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const database_rename_migration_1 = require("./database-rename-migration");
function ensureDir(dirPath) {
    fs_1.default.mkdirSync(dirPath, { recursive: true });
}
function getRepoRoot() {
    if (electron_1.app.isPackaged) {
        return path_1.default.join(process.resourcesPath, "staging");
    }
    return path_1.default.resolve(__dirname, "..", "..", "..");
}
function resolveDatabaseFile(dataDir) {
    return path_1.default.join(dataDir, "neud.sqlite");
}
function getAppPaths() {
    const root = path_1.default.join(electron_1.app.getPath("userData"));
    const dataDir = path_1.default.join(root, "data");
    const backupsDir = path_1.default.join(root, "data", "backups");
    (0, database_rename_migration_1.migrateLegacyDatabaseFile)({ dataDir, backupsDir });
    const paths = {
        root,
        data: dataDir,
        databaseFile: resolveDatabaseFile(dataDir),
        backups: backupsDir,
        projects: path_1.default.join(root, "projects"),
        assets: path_1.default.join(root, "assets"),
        displays: path_1.default.join(root, "displays"),
        controllers: path_1.default.join(root, "controllers"),
        publishing: path_1.default.join(root, "publishing"),
        exports: path_1.default.join(root, "exports"),
        config: path_1.default.join(root, "config"),
        logs: path_1.default.join(root, "logs"),
        engineLogs: path_1.default.join(root, "logs", "engines"),
        engines: path_1.default.join(root, "engines"),
        browserData: path_1.default.join(root, "browser-data"),
        browserProfiles: path_1.default.join(root, "browser-profiles"),
        cookies: path_1.default.join(root, "cookies"),
        cache: path_1.default.join(root, "cache"),
        downloads: path_1.default.join(root, "downloads"),
        serverEnvFile: path_1.default.join(root, "config", "server.env"),
        hostFile: path_1.default.join(root, "config", "host.json"),
        credentialsDir: path_1.default.join(root, "config", "credentials"),
        authCacheFile: path_1.default.join(root, "config", "auth-cache.enc"),
        supabaseUserSessionFile: path_1.default.join(root, "config", "supabase-user-session.enc"),
        repoRoot: getRepoRoot(),
    };
    for (const dir of [
        paths.data,
        paths.backups,
        paths.projects,
        paths.assets,
        paths.displays,
        paths.controllers,
        paths.publishing,
        paths.exports,
        paths.config,
        paths.logs,
        paths.engineLogs,
        paths.engines,
        paths.browserData,
        paths.browserProfiles,
        paths.cookies,
        paths.cache,
        paths.downloads,
        paths.credentialsDir,
    ]) {
        ensureDir(dir);
    }
    return paths;
}
function getWorkerEntryPath(paths) {
    if (electron_1.app.isPackaged) {
        return path_1.default.join(process.resourcesPath, "staging", "worker", "dist", "index.js");
    }
    return path_1.default.join(paths.repoRoot, "workers", "data-engine", "src", "index.js");
}
function getWorkerCwd(paths) {
    if (electron_1.app.isPackaged) {
        return path_1.default.join(process.resourcesPath, "staging", "worker");
    }
    return path_1.default.join(paths.repoRoot, "workers", "data-engine");
}
function getHostname() {
    return os_1.default.hostname();
}
