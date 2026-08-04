"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCanonicalReleaseVersion = getCanonicalReleaseVersion;
exports.syncElectronReleaseVersion = syncElectronReleaseVersion;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
let cachedReleaseVersion = null;
function readVersionFromPackageJson(packageJsonPath) {
    if (!fs_1.default.existsSync(packageJsonPath)) {
        return null;
    }
    try {
        const parsed = JSON.parse(fs_1.default.readFileSync(packageJsonPath, "utf8"));
        const version = typeof parsed.version === "string" ? parsed.version.trim() : "";
        return version || null;
    }
    catch {
        return null;
    }
}
/**
 * Canonical NEUD release version for the desktop runtime.
 *
 * Resolution order:
 * 1. desktop/package.json adjacent to the compiled main process (../package.json from dist/)
 * 2. package.json in the Electron app path
 * 3. package.json in the current working directory
 * 4. Electron app.getVersion() after metadata has been synchronized
 */
function getCanonicalReleaseVersion() {
    if (cachedReleaseVersion) {
        return cachedReleaseVersion;
    }
    const candidates = [
        path_1.default.resolve(__dirname, "..", "package.json"),
        path_1.default.resolve(electron_1.app.getAppPath(), "package.json"),
        path_1.default.resolve(process.cwd(), "package.json"),
    ];
    for (const candidate of candidates) {
        const version = readVersionFromPackageJson(candidate);
        if (version) {
            cachedReleaseVersion = version;
            return cachedReleaseVersion;
        }
    }
    const electronVersion = electron_1.app.getVersion()?.trim();
    if (electronVersion) {
        cachedReleaseVersion = electronVersion;
        return cachedReleaseVersion;
    }
    throw new Error("Unable to resolve NEUD release version from package metadata.");
}
function syncElectronReleaseVersion() {
    return getCanonicalReleaseVersion();
}
