"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialStore = void 0;
exports.loadSupabasePublicConfigFromPaths = loadSupabasePublicConfigFromPaths;
exports.isPackagedApp = isPackagedApp;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const legacy_runtime_migration_1 = require("./legacy-runtime-migration");
const engine_session_auth_1 = require("./engine-session-auth");
const neud_env_1 = require("../env/neud-env");
const validate_1 = require("../utils/validate");
function credentialFile(paths, engineId) {
    return path_1.default.join(paths.credentialsDir, `${engineId}.cred`);
}
function legacyCredentialFiles(paths, engineId) {
    return [
        path_1.default.join(paths.credentialsDir, `${engineId}.cred`),
        path_1.default.join(paths.credentialsDir, "bag-auction.cred"),
        path_1.default.join(paths.credentialsDir, "bag-graphics.cred"),
        path_1.default.join(paths.credentialsDir, "webpage-scraper.cred"),
    ];
}
function canUseSafeStorage() {
    try {
        return electron_1.safeStorage?.isEncryptionAvailable?.() === true;
    }
    catch {
        return false;
    }
}
function readDevFallback() {
    if (!(0, neud_env_1.NEUD_ALLOW_PLAINTEXT_CREDENTIALS)()) {
        return null;
    }
    const email = process.env.BAG_AUCTION_EMAIL?.trim();
    const password = process.env.BAG_AUCTION_PASSWORD;
    if (!email || !password) {
        return null;
    }
    return { email, password };
}
function tryReadEncryptedCredentialFile(filePath) {
    if (!canUseSafeStorage() || !fs_1.default.existsSync(filePath)) {
        return null;
    }
    try {
        const encrypted = fs_1.default.readFileSync(filePath);
        const decrypted = electron_1.safeStorage.decryptString(encrypted);
        const parsed = JSON.parse(decrypted);
        if (!parsed.email || !parsed.password) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
class CredentialStore {
    paths;
    constructor(paths) {
        this.paths = paths;
    }
    hasCredentials(engineId) {
        return this.getCredentialMeta(engineId).hasCredentials;
    }
    hasRunnableAuth(engineId) {
        const meta = this.getCredentialMeta(engineId);
        return meta.hasCredentials || meta.hasPersistedSession;
    }
    getCredentialMeta(engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
        this.migrateLegacyCredentials(id);
        const hasPersistedSession = (0, engine_session_auth_1.hasPersistedSessionCookies)(this.paths, id);
        const stored = this.readStoredCredentials(id);
        if (stored) {
            return {
                hasCredentials: true,
                email: stored.email,
                hasPersistedSession,
            };
        }
        const fallback = readDevFallback();
        if (fallback) {
            return {
                hasCredentials: true,
                email: fallback.email,
                hasPersistedSession,
            };
        }
        return {
            hasCredentials: false,
            email: null,
            hasPersistedSession,
        };
    }
    saveCredentials(engineId, input) {
        const id = (0, validate_1.assertEngineId)(engineId);
        const email = (0, validate_1.assertEmail)(input.email);
        const password = (0, validate_1.assertPassword)(input.password);
        if (!canUseSafeStorage()) {
            throw new Error("Secure credential storage is unavailable on this system.");
        }
        const payload = electron_1.safeStorage.encryptString(JSON.stringify({ email, password }));
        fs_1.default.writeFileSync(credentialFile(this.paths, id), payload);
    }
    clearCredentials(engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
        const file = credentialFile(this.paths, id);
        if (fs_1.default.existsSync(file)) {
            fs_1.default.unlinkSync(file);
        }
    }
    getCredentialsForWorker(engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
        this.migrateLegacyCredentials(id);
        return this.readStoredCredentials(id) ?? readDevFallback();
    }
    getCredentialsForRenderer(engineId) {
        return this.getCredentialsForWorker(engineId);
    }
    readStoredCredentials(engineId) {
        const file = credentialFile(this.paths, engineId);
        return tryReadEncryptedCredentialFile(file);
    }
    migrateLegacyCredentials(engineId) {
        const target = credentialFile(this.paths, engineId);
        if (this.readStoredCredentials(engineId)) {
            return;
        }
        if (fs_1.default.existsSync(target)) {
            try {
                fs_1.default.unlinkSync(target);
                console.info(`[CredentialMigration] removed unusable credential blob engine=${engineId}`);
            }
            catch {
                // best-effort cleanup of unusable copied credential blobs
            }
        }
        for (const legacyFile of legacyCredentialFiles(this.paths, engineId)) {
            if (legacyFile === target || !fs_1.default.existsSync(legacyFile)) {
                continue;
            }
            const decrypted = tryReadEncryptedCredentialFile(legacyFile);
            if (decrypted) {
                try {
                    this.saveCredentials(engineId, decrypted);
                    console.info(`[CredentialMigration] engine=${engineId} source=${legacyFile}`);
                    return;
                }
                catch {
                    // try next legacy candidate
                }
            }
        }
        for (const legacyRoot of (0, legacy_runtime_migration_1.getLegacyUserDataRoots)(this.paths.root)) {
            const legacyCandidates = [
                path_1.default.join(legacyRoot, "config", "credentials", `${engineId}.cred`),
                path_1.default.join(legacyRoot, "config", "credentials", "bag-auction.cred"),
                path_1.default.join(legacyRoot, "config", "credentials", "bag-graphics.cred"),
                path_1.default.join(legacyRoot, "config", "credentials", "webpage-scraper.cred"),
            ];
            for (const legacyFile of legacyCandidates) {
                const decrypted = tryReadEncryptedCredentialFile(legacyFile);
                if (!decrypted)
                    continue;
                try {
                    this.saveCredentials(engineId, decrypted);
                    console.info(`[CredentialMigration] engine=${engineId} source=${legacyFile}`);
                    return;
                }
                catch {
                    // try next legacy candidate
                }
            }
        }
    }
    migrateEnvCredentialsOnce(engineId) {
        if (!(0, neud_env_1.NEUD_ALLOW_PLAINTEXT_CREDENTIALS)()) {
            return false;
        }
        return this.seedFromEnvironment(engineId);
    }
    seedFromEnvironment(engineId) {
        const id = (0, validate_1.assertEngineId)(engineId);
        if (this.readStoredCredentials(id)) {
            return false;
        }
        const email = process.env.BAG_AUCTION_EMAIL?.trim() ||
            process.env.AUCTION_EMAIL?.trim();
        const password = process.env.BAG_AUCTION_PASSWORD || process.env.AUCTION_PASSWORD;
        if (!email || !password) {
            return false;
        }
        if (!canUseSafeStorage()) {
            return false;
        }
        try {
            this.saveCredentials(id, { email, password });
            return true;
        }
        catch {
            return false;
        }
    }
    getRedactionValues(engineId) {
        const creds = this.getCredentialsForWorker(engineId);
        if (!creds)
            return [];
        return [creds.email, creds.password];
    }
}
exports.CredentialStore = CredentialStore;
function loadSupabasePublicConfigFromPaths(paths) {
    const fromEnv = process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (fromEnv) {
        return {
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        };
    }
    if (!fs_1.default.existsSync(paths.serverEnvFile)) {
        return null;
    }
    const lines = fs_1.default.readFileSync(paths.serverEnvFile, "utf8").split(/\r?\n/);
    const values = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const index = trimmed.indexOf("=");
        if (index === -1)
            continue;
        values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
    }
    if (!values.NEXT_PUBLIC_SUPABASE_URL || !values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
        return null;
    }
    return {
        supabaseUrl: values.NEXT_PUBLIC_SUPABASE_URL,
        supabasePublishableKey: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    };
}
function isPackagedApp() {
    return electron_1.app.isPackaged;
}
