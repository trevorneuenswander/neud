"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthLicenseManager = exports.OFFLINE_WINDOW_MS = void 0;
exports.createDeviceId = createDeviceId;
const crypto_1 = require("crypto");
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const platform_permissions_1 = require("../auth/platform-permissions");
const neud_env_1 = require("../env/neud-env");
const messages_1 = require("../auth/messages");
const resolve_authenticated_profile_1 = require("./resolve-authenticated-profile");
const OFFLINE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
exports.OFFLINE_WINDOW_MS = OFFLINE_WINDOW_MS;
const ONLINE_RECENT_MS = 2 * 60 * 1000;
class AuthLicenseManager {
    paths;
    db;
    record = null;
    signingSecret;
    deviceId;
    connectionOnline = false;
    recentlyVerifiedOnline = false;
    constructor(paths, db, deviceId) {
        this.paths = paths;
        this.db = db;
        this.deviceId = deviceId;
        this.signingSecret = resolveSigningSecret(deviceId);
        this.record = this.loadFromDatabase();
    }
    getDeviceId() {
        return this.deviceId;
    }
    establishLocalDesktopSession(input) {
        return this.storeVerifiedSession({
            ...input,
            entitlement: { product: "neud", source: "local-desktop" },
        });
    }
    getStatus() {
        if (!this.record) {
            return {
                mode: "locked",
                allowed: false,
                email: null,
                role: null,
                offlineExpiresAt: null,
                lastVerifiedAt: null,
                requiresOnlineVerification: true,
                message: messages_1.SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE,
                offlineAccessRemainingMs: null,
                offlineAccessWarning: false,
            };
        }
        const now = Date.now();
        const expiresAt = Date.parse(this.record.offlineExpiresAt);
        const withinWindow = Number.isFinite(expiresAt) && now <= expiresAt;
        const remainingMs = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - now) : null;
        const offlineAccessWarning = remainingMs !== null && remainingMs > 0 && remainingMs <= 24 * 60 * 60 * 1000;
        if (!withinWindow) {
            return {
                mode: "locked",
                allowed: false,
                email: this.record.email,
                role: this.record.role,
                offlineExpiresAt: this.record.offlineExpiresAt,
                lastVerifiedAt: this.record.lastVerifiedAt,
                requiresOnlineVerification: true,
                message: "Online account verification is required.",
                offlineAccessRemainingMs: 0,
                offlineAccessWarning: false,
            };
        }
        const lastVerifiedMs = Date.parse(this.record.lastVerifiedAt);
        const recentlyVerified = this.recentlyVerifiedOnline ||
            (Number.isFinite(lastVerifiedMs) && now - lastVerifiedMs <= ONLINE_RECENT_MS);
        const mode = this.connectionOnline && recentlyVerified
            ? "online"
            : "offline";
        return {
            mode,
            allowed: true,
            email: this.record.email,
            role: this.record.role,
            offlineExpiresAt: this.record.offlineExpiresAt,
            lastVerifiedAt: this.record.lastVerifiedAt,
            requiresOnlineVerification: false,
            message: mode === "online"
                ? "Online access is active."
                : "Offline access is active.",
            offlineAccessRemainingMs: remainingMs,
            offlineAccessWarning,
        };
    }
    setConnectionOnline(isOnline) {
        this.connectionOnline = isOnline;
        if (!isOnline) {
            this.recentlyVerifiedOnline = false;
        }
    }
    refreshOnlineVerification() {
        if (!this.record) {
            return;
        }
        const now = new Date();
        const nowMs = now.getTime();
        if (nowMs + 60_000 < this.record.monotonicVerifiedMs) {
            return;
        }
        const record = {
            ...this.record,
            lastVerifiedAt: now.toISOString(),
            offlineExpiresAt: new Date(nowMs + OFFLINE_WINDOW_MS).toISOString(),
            monotonicVerifiedMs: Math.max(this.record.monotonicVerifiedMs, nowMs),
        };
        this.persist(record);
        this.record = record;
        this.recentlyVerifiedOnline = true;
        this.connectionOnline = true;
    }
    getAuthenticatedUser() {
        if (!this.isAccessAllowed()) {
            return null;
        }
        return this.record;
    }
    isAccessAllowed() {
        return this.getStatus().allowed;
    }
    isPlatformAdmin() {
        return (0, platform_permissions_1.isPlatformAdministrator)({ role: this.getAuthenticatedUser()?.role });
    }
    canCreateProject() {
        return (0, platform_permissions_1.canCreateProject)({ role: this.getAuthenticatedUser()?.role });
    }
    canDeleteProject() {
        return (0, platform_permissions_1.canDeleteProject)({ role: this.getAuthenticatedUser()?.role });
    }
    storeVerifiedSession(input) {
        const now = new Date();
        const monotonicVerifiedMs = Math.max(this.record?.monotonicVerifiedMs ?? 0, now.getTime());
        const record = {
            userId: input.userId,
            email: input.email,
            displayName: input.displayName ?? null,
            team: normalizeCachedTeam(input.team ?? this.record?.team ?? null),
            role: input.role,
            entitlement: input.entitlement ?? { product: "neud" },
            issuedAt: now.toISOString(),
            lastVerifiedAt: now.toISOString(),
            offlineExpiresAt: new Date(now.getTime() + OFFLINE_WINDOW_MS).toISOString(),
            monotonicVerifiedMs,
            deviceId: input.deviceId,
            supabaseProjectRef: input.supabaseProjectRef === undefined
                ? this.record?.supabaseProjectRef ?? null
                : input.supabaseProjectRef,
            profileSyncedAt: input.profileSyncedAt === undefined
                ? this.record?.profileSyncedAt ?? null
                : input.profileSyncedAt,
        };
        this.persist(record);
        this.record = record;
        this.recentlyVerifiedOnline = true;
        this.connectionOnline = true;
        return record;
    }
    clear() {
        this.record = null;
        this.connectionOnline = false;
        this.recentlyVerifiedOnline = false;
        this.db.prepare("DELETE FROM auth_cache").run();
        if (fs_1.default.existsSync(this.paths.authCacheFile)) {
            fs_1.default.unlinkSync(this.paths.authCacheFile);
        }
    }
    updateCachedRole(role) {
        if (!this.record || this.record.role === role) {
            return false;
        }
        this.storeVerifiedSession({
            userId: this.record.userId,
            email: this.record.email,
            displayName: this.record.displayName,
            team: this.record.team,
            role,
            entitlement: this.record.entitlement,
            deviceId: this.record.deviceId,
        });
        return true;
    }
    updateCachedProfile(input) {
        if (!this.record) {
            return false;
        }
        const nextDisplayName = (0, resolve_authenticated_profile_1.mergeOptionalProfileString)(this.record.displayName, input.displayName);
        const nextTeam = (0, resolve_authenticated_profile_1.mergeOptionalProfileString)(this.record.team, input.team === undefined ? undefined : normalizeCachedTeam(input.team));
        if (nextDisplayName === this.record.displayName &&
            nextTeam === this.record.team) {
            return false;
        }
        this.storeVerifiedSession({
            userId: this.record.userId,
            email: this.record.email,
            displayName: nextDisplayName,
            team: nextTeam,
            role: this.record.role,
            entitlement: this.record.entitlement,
            deviceId: this.record.deviceId,
        });
        return true;
    }
    persist(record) {
        const signature = signRecord(record, this.signingSecret);
        const payload = { ...record, signature };
        if (electron_1.safeStorage.isEncryptionAvailable()) {
            fs_1.default.writeFileSync(this.paths.authCacheFile, electron_1.safeStorage.encryptString(JSON.stringify(payload)));
        }
        this.db
            .prepare(`INSERT INTO auth_cache (
          id, user_id, email, display_name, team, role, entitlement_json,
          issued_at, last_verified_at, offline_expires_at, monotonic_verified_ms,
          device_id, supabase_project_ref, profile_synced_at, signature, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = excluded.user_id,
          email = excluded.email,
          display_name = excluded.display_name,
          team = excluded.team,
          role = excluded.role,
          entitlement_json = excluded.entitlement_json,
          issued_at = excluded.issued_at,
          last_verified_at = excluded.last_verified_at,
          offline_expires_at = excluded.offline_expires_at,
          monotonic_verified_ms = excluded.monotonic_verified_ms,
          device_id = excluded.device_id,
          supabase_project_ref = excluded.supabase_project_ref,
          profile_synced_at = excluded.profile_synced_at,
          signature = excluded.signature,
          updated_at = excluded.updated_at`)
            .run(record.userId, record.email, record.displayName, record.team, record.role, JSON.stringify(record.entitlement), record.issuedAt, record.lastVerifiedAt, record.offlineExpiresAt, record.monotonicVerifiedMs, record.deviceId, record.supabaseProjectRef, record.profileSyncedAt, signature, new Date().toISOString());
    }
    loadFromDatabase() {
        const row = this.db
            .prepare("SELECT * FROM auth_cache WHERE id = 1")
            .get();
        if (!row) {
            return this.loadFromEncryptedFile();
        }
        const record = {
            userId: row.user_id,
            email: row.email,
            displayName: row.display_name,
            team: normalizeCachedTeam(row.team ?? null),
            role: row.role,
            entitlement: parseJsonObject(row.entitlement_json),
            issuedAt: row.issued_at,
            lastVerifiedAt: row.last_verified_at,
            offlineExpiresAt: row.offline_expires_at,
            monotonicVerifiedMs: row.monotonic_verified_ms,
            deviceId: row.device_id,
            supabaseProjectRef: row.supabase_project_ref ?? null,
            profileSyncedAt: row.profile_synced_at ?? null,
        };
        if (!verifyRecord(record, row.signature, this.signingSecret)) {
            return null;
        }
        return record;
    }
    loadFromEncryptedFile() {
        if (!fs_1.default.existsSync(this.paths.authCacheFile))
            return null;
        if (!electron_1.safeStorage.isEncryptionAvailable())
            return null;
        try {
            const decrypted = electron_1.safeStorage.decryptString(fs_1.default.readFileSync(this.paths.authCacheFile));
            const payload = JSON.parse(decrypted);
            const { signature, ...record } = payload;
            if (!verifyRecord(record, signature, this.signingSecret)) {
                return null;
            }
            return record;
        }
        catch {
            return null;
        }
    }
}
exports.AuthLicenseManager = AuthLicenseManager;
function normalizeCachedTeam(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}
function resolveSigningSecret(deviceId) {
    const fromEnv = (0, neud_env_1.NEUD_AUTH_SIGNING_SECRET)();
    if (fromEnv)
        return fromEnv;
    return (0, crypto_1.createHmac)("sha256", "neud-dev")
        .update(deviceId)
        .digest("hex");
}
function signRecord(record, secret) {
    return (0, crypto_1.createHmac)("sha256", secret)
        .update(JSON.stringify(record))
        .digest("hex");
}
function verifyRecord(record, signature, secret) {
    const expected = signRecord(record, secret);
    const left = Buffer.from(expected, "utf8");
    const right = Buffer.from(signature, "utf8");
    return left.length === right.length && (0, crypto_1.timingSafeEqual)(left, right);
}
function parseJsonObject(value) {
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
function createDeviceId() {
    return (0, crypto_1.randomUUID)();
}
