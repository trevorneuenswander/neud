"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalSessionTokenService = exports.LOCAL_API_SESSION_SETTING_KEY = exports.LOCAL_API_SESSION_HEADER = void 0;
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.LOCAL_API_SESSION_HEADER = "x-neud-local-session";
exports.LOCAL_API_SESSION_SETTING_KEY = "neud.localApiSessionToken";
class LocalSessionTokenService {
    settings;
    paths;
    signingSecret;
    constructor(settings, paths, signingSecret) {
        this.settings = settings;
        this.paths = paths;
        this.signingSecret = signingSecret;
    }
    getOrCreateToken() {
        const existing = this.readStoredToken();
        if (existing) {
            return { token: existing, created: false };
        }
        const token = createSessionToken(this.signingSecret);
        this.persistToken(token);
        return { token, created: true };
    }
    validate(requestToken) {
        if (!requestToken?.trim()) {
            return false;
        }
        const stored = this.readStoredToken();
        if (!stored) {
            return false;
        }
        const left = Buffer.from(stored, "utf8");
        const right = Buffer.from(requestToken.trim(), "utf8");
        return left.length === right.length && (0, crypto_1.timingSafeEqual)(left, right);
    }
    readRequestToken(headers) {
        const current = headers[exports.LOCAL_API_SESSION_HEADER];
        if (typeof current === "string" && current.trim()) {
            return current.trim();
        }
        if (Array.isArray(current) && typeof current[0] === "string" && current[0].trim()) {
            return current[0].trim();
        }
        return undefined;
    }
    writeSessionConfig(input) {
        const config = {
            baseUrl: input.baseUrl.replace(/\/$/, ""),
            sessionToken: input.token,
            userId: input.userId,
            updatedAt: new Date().toISOString(),
        };
        fs_1.default.mkdirSync(this.paths.config, { recursive: true });
        fs_1.default.writeFileSync(this.getSessionConfigPath(), JSON.stringify(config, null, 2), "utf8");
    }
    getSessionConfigPath() {
        return path_1.default.join(this.paths.config, "local-api-session.json");
    }
    clearSessionBinding() {
        if (fs_1.default.existsSync(this.getSessionConfigPath())) {
            fs_1.default.unlinkSync(this.getSessionConfigPath());
        }
    }
    readStoredToken() {
        const current = this.settings.get(exports.LOCAL_API_SESSION_SETTING_KEY, null);
        if (typeof current === "string" && current.trim()) {
            return current.trim();
        }
        return null;
    }
    persistToken(token) {
        this.settings.set(exports.LOCAL_API_SESSION_SETTING_KEY, token);
    }
}
exports.LocalSessionTokenService = LocalSessionTokenService;
function createSessionToken(signingSecret) {
    const nonce = (0, crypto_1.randomBytes)(24).toString("hex");
    const signature = (0, crypto_1.createHmac)("sha256", signingSecret).update(nonce).digest("hex");
    return `${nonce}.${signature}`;
}
