"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePuppeteerModule = resolvePuppeteerModule;
const path_1 = __importDefault(require("path"));
const bag_detail_adapter_path_1 = require("./bag-detail-adapter-path");
const import_esm_module_1 = require("./import-esm-module");
async function resolvePuppeteerModule(paths, workerRoot) {
    const resolverPath = (0, bag_detail_adapter_path_1.resolveDataEngineDistModule)(paths, path_1.default.join("adapters", "legacy-puppeteer-resolver.js"));
    (0, bag_detail_adapter_path_1.assertDataEngineModuleExists)(resolverPath);
    const resolver = await (0, import_esm_module_1.nativeImport)(resolverPath.moduleUrl);
    const imported = await resolver.importPuppeteerFromDir(workerRoot);
    const resolvedBrowser = await resolver.resolvePuppeteerBrowser({
        puppeteerModule: imported.module,
        puppeteerPackagePath: imported.packageJsonPath,
        puppeteerPackageVersion: imported.packageVersion,
    });
    const puppeteer = resolver.getPuppeteerApi(imported.module);
    if (!puppeteer || typeof puppeteer.launch !== "function") {
        throw new Error("Unable to resolve Puppeteer launch API.");
    }
    return {
        puppeteer,
        resolvedBrowser,
        buildPuppeteerLaunchOptions: resolver.buildPuppeteerLaunchOptions,
    };
}
