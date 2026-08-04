"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalUsersRepository = void 0;
const crypto_1 = require("crypto");
function mapUser(row) {
    return {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        phone: row.phone ?? null,
        profileTeam: row.profile_team ?? null,
        supabaseUserId: row.supabase_user_id,
        platformRole: row.platform_role === "owner" ? "owner" : "user",
        isActive: row.is_active !== 0,
        supabaseAccountAvailable: (row.supabase_account_available ?? 1) !== 0,
        lastSupabaseSyncAt: row.last_supabase_sync_at ?? null,
        invitationStatus: row.invitation_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
class LocalUsersRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    countByPlatformRole(platformRole) {
        const row = this.db
            .prepare("SELECT COUNT(*) AS count FROM local_users WHERE platform_role = ? AND is_active = 1")
            .get(platformRole);
        return row.count;
    }
    getById(userId) {
        const row = this.db
            .prepare("SELECT * FROM local_users WHERE id = ?")
            .get(userId);
        return row ? mapUser(row) : null;
    }
    getByEmail(email) {
        const row = this.db
            .prepare("SELECT * FROM local_users WHERE email = ? COLLATE NOCASE")
            .get(email.trim());
        return row ? mapUser(row) : null;
    }
    getBySupabaseUserId(supabaseUserId) {
        const row = this.db
            .prepare("SELECT * FROM local_users WHERE supabase_user_id = ? OR id = ?")
            .get(supabaseUserId, supabaseUserId);
        return row ? mapUser(row) : null;
    }
    listBySupabaseUserIds(supabaseUserIds) {
        if (supabaseUserIds.length === 0) {
            return [];
        }
        const placeholders = supabaseUserIds.map(() => "?").join(", ");
        const rows = this.db
            .prepare(`SELECT * FROM local_users WHERE supabase_user_id IN (${placeholders}) OR id IN (${placeholders})`)
            .all(...supabaseUserIds, ...supabaseUserIds);
        return rows.map(mapUser);
    }
    listByEmail(email) {
        const normalized = email.trim().toLowerCase();
        const rows = this.db
            .prepare("SELECT * FROM local_users WHERE email = ? COLLATE NOCASE")
            .all(normalized);
        return rows.map(mapUser);
    }
    applySupabaseSync(input) {
        const normalizedEmail = input.email.trim().toLowerCase();
        const now = input.syncedAt;
        let existing = this.getBySupabaseUserId(input.supabaseUserId) ??
            (input.linkToExistingId ? this.getById(input.linkToExistingId) : null);
        if (!existing) {
            const emailMatches = this.listByEmail(normalizedEmail);
            if (emailMatches.length === 1) {
                existing = emailMatches[0];
            }
        }
        if (existing) {
            const linked = existing.supabaseUserId !== input.supabaseUserId ||
                existing.id !== input.supabaseUserId;
            const updated = existing.email !== normalizedEmail ||
                existing.fullName !== input.fullName.trim() ||
                existing.supabaseUserId !== input.supabaseUserId ||
                !existing.supabaseAccountAvailable;
            this.db
                .prepare(`UPDATE local_users
           SET email = ?, full_name = ?, supabase_user_id = ?,
               supabase_account_available = 1, last_supabase_sync_at = ?,
               is_active = ?, updated_at = ?
           WHERE id = ?`)
                .run(normalizedEmail, input.fullName.trim(), input.supabaseUserId, now, input.preserveIsActive === false ? 0 : existing.isActive ? 1 : 1, now, existing.id);
            return {
                user: this.getById(existing.id),
                created: false,
                linked,
                updated: updated || linked,
            };
        }
        this.db
            .prepare(`INSERT INTO local_users (
          id, email, full_name, platform_role, supabase_user_id, is_active,
          supabase_account_available, last_supabase_sync_at, invitation_status,
          created_at, updated_at
        ) VALUES (?, ?, ?, 'user', ?, 1, 1, ?, NULL, ?, ?)`)
            .run(input.supabaseUserId, normalizedEmail, input.fullName.trim(), input.supabaseUserId, now, now, now);
        return {
            user: this.getById(input.supabaseUserId),
            created: true,
            linked: true,
            updated: true,
        };
    }
    markSupabaseUnavailableExcept(availableSupabaseUserIds, syncedAt) {
        if (availableSupabaseUserIds.length === 0) {
            const before = this.countSupabaseAvailableLinkedUsers();
            this.db
                .prepare(`UPDATE local_users
           SET supabase_account_available = 0, last_supabase_sync_at = ?, updated_at = ?
           WHERE supabase_user_id IS NOT NULL AND supabase_account_available = 1`)
                .run(syncedAt, syncedAt);
            const after = this.countSupabaseAvailableLinkedUsers();
            return Math.max(0, before - after);
        }
        const placeholders = availableSupabaseUserIds.map(() => "?").join(", ");
        const before = this.countSupabaseAvailableLinkedUsers();
        this.db
            .prepare(`UPDATE local_users
         SET supabase_account_available = 0, last_supabase_sync_at = ?, updated_at = ?
         WHERE supabase_user_id IS NOT NULL
           AND supabase_user_id NOT IN (${placeholders})
           AND supabase_account_available = 1`)
            .run(syncedAt, syncedAt, ...availableSupabaseUserIds);
        const after = this.countSupabaseAvailableLinkedUsers();
        return Math.max(0, before - after);
    }
    deactivateDuplicateByEmail(keepUserId, email) {
        const normalized = email.trim().toLowerCase();
        const now = new Date().toISOString();
        const duplicates = this.db
            .prepare("SELECT id FROM local_users WHERE lower(email) = ? AND id != ?")
            .all(normalized, keepUserId);
        for (const duplicate of duplicates) {
            this.db
                .prepare(`UPDATE local_users
           SET email = ?, is_active = 0, updated_at = ?
           WHERE id = ?`)
                .run(`${normalized}.merged.${duplicate.id}`, now, duplicate.id);
        }
        return duplicates.length;
    }
    countSupabaseAvailableLinkedUsers() {
        const row = this.db
            .prepare("SELECT COUNT(*) AS count FROM local_users WHERE supabase_user_id IS NOT NULL AND supabase_account_available = 1")
            .get();
        return row.count;
    }
    resolveByAuthUserId(authUserId) {
        return this.getBySupabaseUserId(authUserId);
    }
    listAll() {
        const rows = this.db
            .prepare("SELECT * FROM local_users ORDER BY full_name COLLATE NOCASE ASC")
            .all();
        return rows.map(mapUser);
    }
    upsert(input) {
        const now = new Date().toISOString();
        const existing = (input.supabaseUserId ? this.getBySupabaseUserId(input.supabaseUserId) : null) ??
            this.getByEmail(input.email);
        if (existing) {
            this.db
                .prepare(`UPDATE local_users
           SET full_name = ?, platform_role = ?, is_active = ?, invitation_status = ?,
               supabase_user_id = COALESCE(?, supabase_user_id), updated_at = ?
           WHERE id = ?`)
                .run(input.fullName.trim(), input.platformRole, input.isActive === false ? 0 : 1, input.invitationStatus ?? existing.invitationStatus, input.supabaseUserId ?? null, now, existing.id);
            return this.getById(existing.id);
        }
        const id = input.id ?? input.supabaseUserId ?? (0, crypto_1.randomUUID)();
        this.db
            .prepare(`INSERT INTO local_users (
          id, email, full_name, platform_role, supabase_user_id, is_active, invitation_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, input.email.trim().toLowerCase(), input.fullName.trim(), input.platformRole, input.supabaseUserId ?? id, input.isActive === false ? 0 : 1, input.invitationStatus ?? null, now, now);
        return this.getById(id);
    }
    updateIdentity(input) {
        const existing = this.getById(input.id);
        if (!existing) {
            throw new Error("User not found.");
        }
        const now = new Date().toISOString();
        this.db
            .prepare(`UPDATE local_users
         SET email = ?, full_name = ?, platform_role = ?, supabase_user_id = ?,
             is_active = ?, supabase_account_available = ?, last_supabase_sync_at = ?,
             updated_at = ?
         WHERE id = ?`)
            .run((input.email ?? existing.email).trim().toLowerCase(), (input.fullName ?? existing.fullName).trim(), input.platformRole ?? existing.platformRole, input.supabaseUserId === undefined
            ? existing.supabaseUserId
            : input.supabaseUserId, input.isActive === undefined ? (existing.isActive ? 1 : 0) : input.isActive ? 1 : 0, input.supabaseAccountAvailable === undefined
            ? existing.supabaseAccountAvailable
                ? 1
                : 0
            : input.supabaseAccountAvailable
                ? 1
                : 0, input.lastSupabaseSyncAt === undefined
            ? existing.lastSupabaseSyncAt
            : input.lastSupabaseSyncAt, now, input.id);
        return this.getById(input.id);
    }
    updateSyncedProfileFields(input) {
        const existing = this.getById(input.userId);
        if (!existing) {
            return null;
        }
        const nextFullName = input.fullName?.trim() || existing.fullName;
        const nextPhone = input.phone === undefined ? existing.phone : input.phone?.trim() || null;
        const nextProfileTeam = input.profileTeam === undefined
            ? existing.profileTeam
            : input.profileTeam?.trim() || null;
        this.db
            .prepare(`UPDATE local_users
         SET full_name = ?, phone = ?, profile_team = ?,
             supabase_account_available = 1, last_supabase_sync_at = ?, updated_at = ?
         WHERE id = ?`)
            .run(nextFullName, nextPhone, nextProfileTeam, input.syncedAt, input.syncedAt, input.userId);
        return this.getById(input.userId);
    }
    setActive(userId, isActive) {
        const now = new Date().toISOString();
        this.db
            .prepare("UPDATE local_users SET is_active = ?, updated_at = ? WHERE id = ?")
            .run(isActive ? 1 : 0, now, userId);
        return this.getById(userId);
    }
}
exports.LocalUsersRepository = LocalUsersRepository;
