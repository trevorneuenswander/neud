"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseUserSessionService = void 0;
const fs_1 = __importDefault(require("fs"));
const electron_1 = require("electron");
const supabase_js_1 = require("@supabase/supabase-js");
const ws_1 = __importDefault(require("ws"));
function sessionFile(paths) {
    return paths.supabaseUserSessionFile;
}
function canUseSafeStorage() {
    try {
        return electron_1.safeStorage?.isEncryptionAvailable?.() === true;
    }
    catch {
        return false;
    }
}
class SupabaseUserSessionService {
    paths;
    tokens = null;
    userId = null;
    client = null;
    constructor(paths) {
        this.paths = paths;
        this.loadFromDisk();
    }
    storeSession(input) {
        this.userId = input.userId;
        this.tokens = {
            accessToken: input.accessToken,
            refreshToken: input.refreshToken,
            expiresAt: input.expiresAt,
        };
        this.client = null;
        this.persist();
    }
    clearSession() {
        this.tokens = null;
        this.userId = null;
        this.client = null;
        const filePath = sessionFile(this.paths);
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
        }
    }
    hasCloudSession() {
        return Boolean(this.tokens?.accessToken && this.tokens.refreshToken);
    }
    getUserId() {
        return this.userId;
    }
    isCloudSessionFresh() {
        if (!this.tokens) {
            return false;
        }
        return this.tokens.expiresAt > Date.now() + 30_000;
    }
    async getAuthenticatedClient(config) {
        if (!this.tokens?.accessToken || !this.tokens.refreshToken) {
            return null;
        }
        if (!this.client) {
            this.client = (0, supabase_js_1.createClient)(config.supabaseUrl, config.supabasePublishableKey, {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false,
                },
                global: {
                    headers: {
                        Authorization: `Bearer ${this.tokens.accessToken}`,
                    },
                },
                realtime: {
                    transport: ws_1.default,
                },
            });
            await this.client.auth.setSession({
                access_token: this.tokens.accessToken,
                refresh_token: this.tokens.refreshToken,
            });
        }
        if (!this.isCloudSessionFresh()) {
            const { data, error } = await this.client.auth.refreshSession();
            if (error || !data.session) {
                this.clearSession();
                return null;
            }
            this.tokens = {
                accessToken: data.session.access_token,
                refreshToken: data.session.refresh_token,
                expiresAt: (data.session.expires_at ?? 0) * 1000,
            };
            this.persist();
        }
        return this.client;
    }
    persist() {
        if (!this.tokens || !this.userId || !canUseSafeStorage()) {
            return;
        }
        const payload = {
            userId: this.userId,
            ...this.tokens,
        };
        fs_1.default.writeFileSync(sessionFile(this.paths), electron_1.safeStorage.encryptString(JSON.stringify(payload)));
    }
    loadFromDisk() {
        if (!canUseSafeStorage()) {
            return;
        }
        const filePath = sessionFile(this.paths);
        if (!fs_1.default.existsSync(filePath)) {
            return;
        }
        try {
            const decrypted = electron_1.safeStorage.decryptString(fs_1.default.readFileSync(filePath));
            const parsed = JSON.parse(decrypted);
            if (!parsed.userId ||
                !parsed.accessToken ||
                !parsed.refreshToken ||
                typeof parsed.expiresAt !== "number") {
                return;
            }
            this.userId = parsed.userId;
            this.tokens = {
                accessToken: parsed.accessToken,
                refreshToken: parsed.refreshToken,
                expiresAt: parsed.expiresAt,
            };
        }
        catch {
            this.tokens = null;
            this.userId = null;
        }
    }
}
exports.SupabaseUserSessionService = SupabaseUserSessionService;
