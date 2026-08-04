import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { safeStorage } from "electron";
import fs from "fs";
import type { AppPaths } from "./app-paths";
import type { LocalDatabase } from "../database/connection";
import {
  canCreateProject as roleCanCreateProject,
  canDeleteProject as roleCanDeleteProject,
  isPlatformAdministrator,
} from "../auth/platform-permissions";
import { NEUD_AUTH_SIGNING_SECRET } from "../env/neud-env";
import { SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE } from "../auth/messages";
import { mergeOptionalProfileString } from "./resolve-authenticated-profile";

const OFFLINE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ONLINE_RECENT_MS = 2 * 60 * 1000;

export { OFFLINE_WINDOW_MS };

export type AuthCacheRecord = {
  userId: string;
  email: string;
  displayName: string | null;
  team: string | null;
  role: string;
  entitlement: Record<string, unknown>;
  issuedAt: string;
  lastVerifiedAt: string;
  offlineExpiresAt: string;
  monotonicVerifiedMs: number;
  deviceId: string;
  supabaseProjectRef: string | null;
  profileSyncedAt: string | null;
};

export type AuthStatus = {
  mode: "locked" | "offline" | "online";
  allowed: boolean;
  email: string | null;
  role: string | null;
  offlineExpiresAt: string | null;
  lastVerifiedAt: string | null;
  requiresOnlineVerification: boolean;
  message: string;
  offlineAccessRemainingMs: number | null;
  offlineAccessWarning: boolean;
};

type StoredAuthPayload = AuthCacheRecord & {
  signature: string;
};

export class AuthLicenseManager {
  private record: AuthCacheRecord | null = null;
  private signingSecret: string;
  private readonly deviceId: string;
  private connectionOnline = false;
  private recentlyVerifiedOnline = false;

  constructor(
    private readonly paths: AppPaths,
    private readonly db: LocalDatabase,
    deviceId: string,
  ) {
    this.deviceId = deviceId;
    this.signingSecret = resolveSigningSecret(deviceId);
    this.record = this.loadFromDatabase();
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  establishLocalDesktopSession(input: {
    userId: string;
    email: string;
    displayName?: string | null;
    team?: string | null;
    role: string;
    deviceId: string;
  }): AuthCacheRecord {
    return this.storeVerifiedSession({
      ...input,
      entitlement: { product: "neud", source: "local-desktop" },
    });
  }

  getStatus(): AuthStatus {
    if (!this.record) {
      return {
        mode: "locked",
        allowed: false,
        email: null,
        role: null,
        offlineExpiresAt: null,
        lastVerifiedAt: null,
        requiresOnlineVerification: true,
        message: SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE,
        offlineAccessRemainingMs: null,
        offlineAccessWarning: false,
      };
    }

    const now = Date.now();
    const expiresAt = Date.parse(this.record.offlineExpiresAt);
    const withinWindow = Number.isFinite(expiresAt) && now <= expiresAt;
    const remainingMs = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - now) : null;
    const offlineAccessWarning =
      remainingMs !== null && remainingMs > 0 && remainingMs <= 24 * 60 * 60 * 1000;

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
    const recentlyVerified =
      this.recentlyVerifiedOnline ||
      (Number.isFinite(lastVerifiedMs) && now - lastVerifiedMs <= ONLINE_RECENT_MS);
    const mode =
      this.connectionOnline && recentlyVerified
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
      message:
        mode === "online"
          ? "Online access is active."
          : "Offline access is active.",
      offlineAccessRemainingMs: remainingMs,
      offlineAccessWarning,
    };
  }

  setConnectionOnline(isOnline: boolean): void {
    this.connectionOnline = isOnline;
    if (!isOnline) {
      this.recentlyVerifiedOnline = false;
    }
  }

  refreshOnlineVerification(): void {
    if (!this.record) {
      return;
    }

    const now = new Date();
    const nowMs = now.getTime();
    if (nowMs + 60_000 < this.record.monotonicVerifiedMs) {
      return;
    }

    const record: AuthCacheRecord = {
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

  getAuthenticatedUser(): AuthCacheRecord | null {
    if (!this.isAccessAllowed()) {
      return null;
    }
    return this.record;
  }

  isAccessAllowed(): boolean {
    return this.getStatus().allowed;
  }

  isPlatformAdmin(): boolean {
    return isPlatformAdministrator({ role: this.getAuthenticatedUser()?.role });
  }

  canCreateProject(): boolean {
    return roleCanCreateProject({ role: this.getAuthenticatedUser()?.role });
  }

  canDeleteProject(): boolean {
    return roleCanDeleteProject({ role: this.getAuthenticatedUser()?.role });
  }

  storeVerifiedSession(input: {
    userId: string;
    email: string;
    displayName?: string | null;
    team?: string | null;
    role: string;
    entitlement?: Record<string, unknown>;
    deviceId: string;
    supabaseProjectRef?: string | null;
    profileSyncedAt?: string | null;
  }): AuthCacheRecord {
    const now = new Date();
    const monotonicVerifiedMs = Math.max(
      this.record?.monotonicVerifiedMs ?? 0,
      now.getTime(),
    );

    const record: AuthCacheRecord = {
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
      supabaseProjectRef:
        input.supabaseProjectRef === undefined
          ? this.record?.supabaseProjectRef ?? null
          : input.supabaseProjectRef,
      profileSyncedAt:
        input.profileSyncedAt === undefined
          ? this.record?.profileSyncedAt ?? null
          : input.profileSyncedAt,
    };

    this.persist(record);
    this.record = record;
    this.recentlyVerifiedOnline = true;
    this.connectionOnline = true;
    return record;
  }

  clear(): void {
    this.record = null;
    this.connectionOnline = false;
    this.recentlyVerifiedOnline = false;
    this.db.prepare("DELETE FROM auth_cache").run();
    if (fs.existsSync(this.paths.authCacheFile)) {
      fs.unlinkSync(this.paths.authCacheFile);
    }
  }

  updateCachedRole(role: string): boolean {
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

  updateCachedProfile(input: {
    displayName?: string | null;
    team?: string | null;
  }): boolean {
    if (!this.record) {
      return false;
    }

    const nextDisplayName = mergeOptionalProfileString(
      this.record.displayName,
      input.displayName,
    );
    const nextTeam = mergeOptionalProfileString(
      this.record.team,
      input.team === undefined ? undefined : normalizeCachedTeam(input.team),
    );

    if (
      nextDisplayName === this.record.displayName &&
      nextTeam === this.record.team
    ) {
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

  private persist(record: AuthCacheRecord) {
    const signature = signRecord(record, this.signingSecret);
    const payload: StoredAuthPayload = { ...record, signature };

    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(
        this.paths.authCacheFile,
        safeStorage.encryptString(JSON.stringify(payload)),
      );
    }

    this.db
      .prepare(
        `INSERT INTO auth_cache (
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
          updated_at = excluded.updated_at`,
      )
      .run(
        record.userId,
        record.email,
        record.displayName,
        record.team,
        record.role,
        JSON.stringify(record.entitlement),
        record.issuedAt,
        record.lastVerifiedAt,
        record.offlineExpiresAt,
        record.monotonicVerifiedMs,
        record.deviceId,
        record.supabaseProjectRef,
        record.profileSyncedAt,
        signature,
        new Date().toISOString(),
      );
  }

  private loadFromDatabase(): AuthCacheRecord | null {
    const row = this.db
      .prepare("SELECT * FROM auth_cache WHERE id = 1")
      .get() as
      | {
          user_id: string;
          email: string;
          display_name: string | null;
          team?: string | null;
          role: string;
          entitlement_json: string;
          issued_at: string;
          last_verified_at: string;
          offline_expires_at: string;
          monotonic_verified_ms: number;
          device_id: string;
          supabase_project_ref?: string | null;
          profile_synced_at?: string | null;
          signature: string;
        }
      | undefined;

    if (!row) {
      return this.loadFromEncryptedFile();
    }

    const record: AuthCacheRecord = {
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

  private loadFromEncryptedFile(): AuthCacheRecord | null {
    if (!fs.existsSync(this.paths.authCacheFile)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;

    try {
      const decrypted = safeStorage.decryptString(
        fs.readFileSync(this.paths.authCacheFile),
      );
      const payload = JSON.parse(decrypted) as StoredAuthPayload;
      const { signature, ...record } = payload;
      if (!verifyRecord(record, signature, this.signingSecret)) {
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }
}

function normalizeCachedTeam(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveSigningSecret(deviceId: string): string {
  const fromEnv = NEUD_AUTH_SIGNING_SECRET();
  if (fromEnv) return fromEnv;
  return createHmac("sha256", "neud-dev")
    .update(deviceId)
    .digest("hex");
}

function signRecord(record: AuthCacheRecord, secret: string): string {
  return createHmac("sha256", secret)
    .update(JSON.stringify(record))
    .digest("hex");
}

function verifyRecord(
  record: AuthCacheRecord,
  signature: string,
  secret: string,
): boolean {
  const expected = signRecord(record, secret);
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(signature, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function createDeviceId(): string {
  return randomUUID();
}
