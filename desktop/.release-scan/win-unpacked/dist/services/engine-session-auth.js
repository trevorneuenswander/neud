"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEngineCookiesFile = getEngineCookiesFile;
exports.hasPersistedSessionCookies = hasPersistedSessionCookies;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function getEngineCookiesFile(paths, engineId) {
    return path_1.default.join(paths.cookies, `${engineId}.json`);
}
function hasPersistedSessionCookies(paths, engineId) {
    const file = getEngineCookiesFile(paths, engineId);
    if (!fs_1.default.existsSync(file)) {
        return false;
    }
    try {
        const parsed = JSON.parse(fs_1.default.readFileSync(file, "utf8"));
        return Array.isArray(parsed) && parsed.length > 0;
    }
    catch {
        return false;
    }
}
