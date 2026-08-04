"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDataEngineDistModule = resolveDataEngineDistModule;
exports.resolveBagLotDetailAdapterPath = resolveBagLotDetailAdapterPath;
exports.assertDataEngineModuleExists = assertDataEngineModuleExists;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const node_url_1 = require("node:url");
const electron_1 = require("electron");
function getDataEngineRoot(paths) {
    if (electron_1.app.isPackaged) {
        return path_1.default.join(paths.repoRoot, "worker");
    }
    return path_1.default.join(paths.repoRoot, "workers", "data-engine");
}
/**
 * Resolve a compiled worker module under data-engine/dist/.
 * Prefers dist over src so packaged and dev builds share the same import path.
 */
function resolveDataEngineDistModule(paths, relativePath) {
    const workerRoot = getDataEngineRoot(paths);
    const absolutePath = path_1.default.join(workerRoot, "dist", relativePath);
    return {
        absolutePath,
        moduleUrl: (0, node_url_1.pathToFileURL)(absolutePath).href,
        workerRoot,
    };
}
function resolveBagLotDetailAdapterPath(paths) {
    return resolveDataEngineDistModule(paths, path_1.default.join("adapters", "bag-lot-detail-page.js"));
}
function assertDataEngineModuleExists(resolved) {
    if (!fs_1.default.existsSync(resolved.absolutePath)) {
        throw new Error(`BAG lot-detail adapter not found at ${resolved.absolutePath}. ` +
            "Run the data-engine build (npm run build in workers/data-engine) before exporting.");
    }
}
