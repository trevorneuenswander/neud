"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BAG_EXPORT_LOGIN_FAILED_MESSAGE = void 0;
exports.authenticateBroadArrowExportBrowser = authenticateBroadArrowExportBrowser;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const default_sources_1 = require("../bag/default-sources");
const bag_detail_adapter_path_1 = require("./bag-detail-adapter-path");
const import_esm_module_1 = require("./import-esm-module");
const project_scraper_auth_1 = require("./project-scraper-auth");
exports.BAG_EXPORT_LOGIN_FAILED_MESSAGE = "NEUD could not sign in to the auction website. Verify the saved Webpage Scraper credentials and try again.";
function buildBagSourcesForLogin(dataSources, engineId) {
    return default_sources_1.BAG_DEFAULT_SCRAPER_SOURCES.map((defaults) => {
        const configured = dataSources.getSourceByKey(engineId, defaults.sourceKey);
        return {
            source_key: defaults.sourceKey,
            url: configured?.url?.trim() || defaults.url,
            enabled: true,
        };
    });
}
async function authenticateBroadArrowExportBrowser(input) {
    const creds = (0, project_scraper_auth_1.getProjectWebpageScraperCredentials)(input.credentials, input.engineId);
    if (!creds?.email?.trim() || !creds.password) {
        throw new project_scraper_auth_1.MissingScraperCredentialsError(project_scraper_auth_1.BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE);
    }
    const browserUserDataDir = path_1.default.join(input.paths.browserData, input.engineId);
    fs_1.default.mkdirSync(browserUserDataDir, { recursive: true });
    fs_1.default.mkdirSync(input.paths.cookies, { recursive: true });
    process.env.NEUD_APP_DATA_DIR = input.paths.root;
    process.env.NEUD_BROWSER_USER_DATA_DIR = browserUserDataDir;
    process.env.NEUD_COOKIES_DIR = input.paths.cookies;
    process.env.ENGINE_ID = input.engineId;
    process.env.BAG_AUCTION_EMAIL = creds.email.trim();
    process.env.BAG_AUCTION_PASSWORD = creds.password;
    const loginModulePath = (0, bag_detail_adapter_path_1.resolveDataEngineDistModule)(input.paths, path_1.default.join("bag-login-flow.js"));
    (0, bag_detail_adapter_path_1.assertDataEngineModuleExists)(loginModulePath);
    const loginModule = await (0, import_esm_module_1.nativeImport)(loginModulePath.moduleUrl);
    const sources = buildBagSourcesForLogin(input.dataSources, input.engineId);
    const loginUrl = sources.find((source) => source.source_key === "login")?.url ??
        `${default_sources_1.BAG_AUCTION_SITE_ORIGIN}/users/sign_in`;
    let result;
    try {
        result = await loginModule.performBagLogin({
            engineId: input.engineId,
            page: input.page,
            sources,
            cfg: { login: default_sources_1.BAG_LOGIN_CONFIG },
            runStep: async (_engineId, _stage, action) => action(),
            shareCookies: async () => { },
        });
    }
    catch {
        throw new Error(exports.BAG_EXPORT_LOGIN_FAILED_MESSAGE);
    }
    if (input.page.url().includes("/users/sign_in")) {
        throw new Error(exports.BAG_EXPORT_LOGIN_FAILED_MESSAGE);
    }
    if (result.authenticationStatus !== "Authenticated") {
        throw new Error(exports.BAG_EXPORT_LOGIN_FAILED_MESSAGE);
    }
    let authenticatedOrigin = default_sources_1.BAG_AUCTION_SITE_ORIGIN;
    try {
        authenticatedOrigin = new URL(loginUrl).origin;
    }
    catch {
        // keep default origin
    }
    return { authenticated: true, authenticatedOrigin };
}
