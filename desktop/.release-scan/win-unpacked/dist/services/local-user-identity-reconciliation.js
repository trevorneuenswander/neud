"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_RECONCILIATION_TIMEOUT_MS = void 0;
exports.reconcileLocalUserIdentity = reconcileLocalUserIdentity;
exports.reconcileLocalUserIdentitySync = reconcileLocalUserIdentitySync;
exports.getLocalUserConflictDiagnostics = getLocalUserConflictDiagnostics;
exports.getLocalIdentitySyncDiagnostics = getLocalIdentitySyncDiagnostics;
const normalize_email_1 = require("../auth/normalize-email");
const with_timeout_1 = require("../utils/with-timeout");
exports.LOCAL_RECONCILIATION_TIMEOUT_MS = 5_000;
const USER_REFERENCE_UPDATES = [
    { table: "team_memberships", column: "user_id", uniqueWith: ["team_id"], primaryKey: ["id"] },
    {
        table: "project_memberships",
        column: "user_id",
        uniqueWith: ["project_id", "team_id"],
        primaryKey: ["id"],
    },
    {
        table: "local_project_memberships",
        column: "user_id",
        uniqueWith: ["project_id"],
        primaryKey: ["project_id", "user_id"],
    },
    {
        table: "user_display_order",
        column: "user_id",
        uniqueWith: ["project_id", "display_id"],
        primaryKey: ["user_id", "project_id", "display_id"],
        preferNewerOnConflict: true,
    },
    { table: "teams", column: "created_by_user_id" },
    { table: "project_team_assignments", column: "created_by_user_id" },
    { table: "team_memberships", column: "created_by_user_id" },
    { table: "project_memberships", column: "created_by_user_id" },
    { table: "project_display_code", column: "archived_by_user_id" },
    { table: "local_users", column: "deleted_by_user_id" },
    { table: "auth_cache", column: "user_id" },
];
async function reconcileLocalUserIdentity(input) {
    return (0, with_timeout_1.withTimeout)(Promise.resolve().then(() => reconcileLocalUserIdentitySync(input)), exports.LOCAL_RECONCILIATION_TIMEOUT_MS, "Local identity reconciliation timed out").catch((error) => ({
        status: "error",
        code: error instanceof with_timeout_1.TimeoutError ? "LOCAL_RECONCILIATION_TIMEOUT" : "LOCAL_RECONCILIATION_FAILED",
        message: error instanceof Error ? error.message : "Local identity reconciliation failed.",
    }));
}
function reconcileLocalUserIdentitySync(input) {
    return reconcileLocalUserIdentityInternal(input);
}
function reconcileLocalUserIdentityInternal(input) {
    const normalizedEmail = (0, normalize_email_1.normalizeEmail)(input.email);
    const syncedAt = input.syncedAt ?? new Date().toISOString();
    const authoritativeUserId = input.supabaseUserId;
    const emailMatches = input.users
        .listByEmail(normalizedEmail)
        .filter((user) => user.isActive);
    const linkedRow = input.users.getBySupabaseUserId(authoritativeUserId);
    const previousStaleRow = input.previousAuthUserId &&
        input.previousAuthUserId !== authoritativeUserId
        ? input.users.getById(input.previousAuthUserId)
        : null;
    const obsoleteRows = collectObsoleteLocalUserRows({
        authoritativeUserId,
        normalizedEmail,
        emailMatches,
        linkedRow,
        previousStaleRow,
        users: input.users,
    });
    const conflict = detectUnsafeIdentityConflict({
        authoritativeUserId,
        normalizedEmail,
        emailMatches,
        obsoleteRows,
        linkedRow,
    });
    if (conflict) {
        return conflict;
    }
    if (obsoleteRows.length === 0 && linkedRow?.id === authoritativeUserId) {
        return upsertOnly({
            db: input.db,
            authoritativeUserId,
            normalizedEmail,
            fullName: input.fullName,
            platformRole: input.platformRole,
            phone: input.phone ?? null,
            profileTeam: input.profileTeam ?? null,
            syncedAt,
        });
    }
    try {
        return input.db.transaction(() => {
            let migratedReferenceCount = 0;
            let primaryObsoleteUserId = null;
            for (const obsoleteRow of obsoleteRows) {
                migratedReferenceCount += migrateLocalUserReferences(input.db, obsoleteRow.id, authoritativeUserId);
                input.db.prepare("DELETE FROM local_users WHERE id = ?").run(obsoleteRow.id);
                primaryObsoleteUserId ??= obsoleteRow.id;
            }
            upsertCanonicalLocalUser(input.db, {
                id: authoritativeUserId,
                email: normalizedEmail,
                fullName: input.fullName,
                platformRole: input.platformRole,
                phone: input.phone ?? null,
                profileTeam: input.profileTeam ?? null,
                supabaseUserId: authoritativeUserId,
                syncedAt,
            });
            const verified = input.users.getBySupabaseUserId(authoritativeUserId);
            if (!verified || (0, normalize_email_1.normalizeEmail)(verified.email) !== normalizedEmail) {
                throw new Error("Local identity cache verification failed after reconciliation.");
            }
            const duplicateEmails = input.users
                .listByEmail(normalizedEmail)
                .filter((user) => user.isActive && user.id !== authoritativeUserId);
            if (duplicateEmails.length > 0) {
                throw new Error("Duplicate local identity rows remain after reconciliation.");
            }
            if (primaryObsoleteUserId) {
                return {
                    status: "reconciled",
                    userId: authoritativeUserId,
                    obsoleteUserId: primaryObsoleteUserId,
                    migratedReferenceCount,
                };
            }
            return {
                status: "synced",
                userId: authoritativeUserId,
                migratedReferenceCount,
            };
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Local identity reconciliation failed.";
        if (message.includes("UNIQUE constraint failed: local_users.email")) {
            return {
                status: "conflict",
                code: "UNSAFE_IDENTITY_CONFLICT",
                message,
                conflictingLocalUserId: obsoleteRows[0]?.id ?? null,
                currentAuthUserId: authoritativeUserId,
                email: normalizedEmail,
            };
        }
        if (message.includes("UNIQUE constraint failed: local_users.supabase_user_id")) {
            return {
                status: "conflict",
                code: "UNSAFE_IDENTITY_CONFLICT",
                message,
                conflictingLocalUserId: obsoleteRows[0]?.id ?? linkedRow?.id ?? null,
                currentAuthUserId: authoritativeUserId,
                email: normalizedEmail,
            };
        }
        if (message.includes("verification failed")) {
            return {
                status: "error",
                code: "LOCAL_RECONCILIATION_VERIFY_FAILED",
                message,
            };
        }
        if (message.includes("Duplicate local identity rows remain")) {
            return {
                status: "error",
                code: "LOCAL_RECONCILIATION_DUPLICATE_REMAINS",
                message,
            };
        }
        return {
            status: "error",
            code: "LOCAL_RECONCILIATION_FAILED",
            message,
        };
    }
}
function collectObsoleteLocalUserRows(input) {
    const obsolete = new Map();
    for (const row of input.emailMatches) {
        if (row.id !== input.authoritativeUserId) {
            obsolete.set(row.id, row);
        }
    }
    if (input.linkedRow && input.linkedRow.id !== input.authoritativeUserId) {
        obsolete.set(input.linkedRow.id, input.linkedRow);
    }
    if (input.previousStaleRow && input.previousStaleRow.id !== input.authoritativeUserId) {
        obsolete.set(input.previousStaleRow.id, input.previousStaleRow);
    }
    for (const user of input.users.listAll()) {
        if (user.id === input.authoritativeUserId) {
            continue;
        }
        if (user.email.startsWith(`${input.normalizedEmail}.merged.`)) {
            obsolete.set(user.id, user);
        }
        if (user.supabaseUserId === input.authoritativeUserId) {
            obsolete.set(user.id, user);
        }
    }
    return [...obsolete.values()];
}
function detectUnsafeIdentityConflict(input) {
    const unrelatedActiveMatches = input.emailMatches.filter((user) => user.id !== input.authoritativeUserId &&
        user.supabaseUserId &&
        user.supabaseUserId !== input.authoritativeUserId &&
        !input.obsoleteRows.some((obsolete) => obsolete.id === user.id));
    if (unrelatedActiveMatches.length > 0) {
        return {
            status: "conflict",
            code: "UNSAFE_IDENTITY_CONFLICT",
            message: "Multiple active local accounts share this email. Automatic merge is not safe.",
            conflictingLocalUserId: unrelatedActiveMatches[0]?.id ?? null,
            currentAuthUserId: input.authoritativeUserId,
            email: input.normalizedEmail,
        };
    }
    if (input.linkedRow &&
        input.linkedRow.id !== input.authoritativeUserId &&
        (0, normalize_email_1.normalizeEmail)(input.linkedRow.email) !== input.normalizedEmail &&
        input.obsoleteRows.length === 0) {
        return {
            status: "conflict",
            code: "UNSAFE_IDENTITY_CONFLICT",
            message: "Local account records conflict and cannot be merged automatically.",
            conflictingLocalUserId: input.linkedRow.id,
            currentAuthUserId: input.authoritativeUserId,
            email: input.normalizedEmail,
        };
    }
    return null;
}
function upsertOnly(input) {
    try {
        return input.db.transaction(() => {
            upsertCanonicalLocalUser(input.db, {
                id: input.authoritativeUserId,
                email: input.normalizedEmail,
                fullName: input.fullName,
                platformRole: input.platformRole,
                phone: input.phone ?? null,
                profileTeam: input.profileTeam ?? null,
                supabaseUserId: input.authoritativeUserId,
                syncedAt: input.syncedAt,
            });
            return {
                status: "synced",
                userId: input.authoritativeUserId,
                migratedReferenceCount: 0,
            };
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Local identity sync failed.";
        return {
            status: "error",
            code: "LOCAL_RECONCILIATION_FAILED",
            message,
        };
    }
}
function upsertCanonicalLocalUser(db, input) {
    const existing = db
        .prepare("SELECT id FROM local_users WHERE id = ?")
        .get(input.id);
    if (existing) {
        db.prepare(`UPDATE local_users
       SET email = ?, full_name = ?, platform_role = ?, phone = ?, profile_team = ?,
           supabase_user_id = ?, is_active = 1, supabase_account_available = 1,
           last_supabase_sync_at = ?, updated_at = ?
       WHERE id = ?`).run(input.email, input.fullName.trim(), input.platformRole, input.phone?.trim() || null, input.profileTeam?.trim() || null, input.supabaseUserId, input.syncedAt, input.syncedAt, input.id);
        return;
    }
    db.prepare(`INSERT INTO local_users (
      id, email, full_name, phone, profile_team, platform_role, supabase_user_id, is_active,
      supabase_account_available, last_supabase_sync_at, invitation_status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, NULL, ?, ?)`).run(input.id, input.email, input.fullName.trim(), input.phone?.trim() || null, input.profileTeam?.trim() || null, input.platformRole, input.supabaseUserId, input.syncedAt, input.syncedAt, input.syncedAt);
}
function tableHasColumn(db, table, column) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    return rows.some((row) => row.name === column);
}
function migrateLocalUserReferences(db, fromUserId, toUserId) {
    if (fromUserId === toUserId) {
        return 0;
    }
    let migratedCount = 0;
    for (const target of USER_REFERENCE_UPDATES) {
        if (!tableHasColumn(db, target.table, target.column)) {
            continue;
        }
        if (target.uniqueWith?.length) {
            const rows = db
                .prepare(`SELECT * FROM ${target.table} WHERE ${target.column} = ?`)
                .all(fromUserId);
            for (const row of rows) {
                const whereParts = target.uniqueWith.map((column) => `${column} = ?`);
                const whereValues = target.uniqueWith.map((column) => row[column]);
                const existing = db
                    .prepare(`SELECT * FROM ${target.table} WHERE ${target.column} = ? AND ${whereParts.join(" AND ")}`)
                    .get(toUserId, ...whereValues);
                if (existing) {
                    if (target.preferNewerOnConflict) {
                        const incomingUpdatedAt = typeof row.updated_at === "string" ? row.updated_at : null;
                        const existingUpdatedAt = typeof existing.updated_at === "string" ? existing.updated_at : null;
                        if (incomingUpdatedAt &&
                            (!existingUpdatedAt || incomingUpdatedAt > existingUpdatedAt)) {
                            deleteRowByPrimaryKey(db, target.table, target.primaryKey, existing);
                            moveCompositeMembershipRow(db, target, row, toUserId);
                            migratedCount += 1;
                            continue;
                        }
                    }
                    deleteRowByPrimaryKey(db, target.table, target.primaryKey, row);
                    continue;
                }
                if (moveCompositeMembershipRow(db, target, row, toUserId)) {
                    migratedCount += 1;
                }
            }
            continue;
        }
        if (target.table === "auth_cache") {
            db.prepare(`UPDATE ${target.table} SET ${target.column} = ? WHERE id = 1`).run(toUserId);
            migratedCount += 1;
            continue;
        }
        db.prepare(`UPDATE ${target.table} SET ${target.column} = ? WHERE ${target.column} = ?`).run(toUserId, fromUserId);
        migratedCount += 1;
    }
    return migratedCount;
}
function deleteRowByPrimaryKey(db, table, primaryKey, row) {
    if (primaryKey?.length) {
        if (primaryKey.length === 1 && primaryKey[0] === "id" && typeof row.id === "string") {
            db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
            return;
        }
        const where = primaryKey.map((column) => `${column} = ?`).join(" AND ");
        const values = primaryKey.map((column) => row[column]);
        db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...values);
        return;
    }
    if (typeof row.id === "string") {
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
    }
}
function moveCompositeMembershipRow(db, target, row, toUserId) {
    if (target.primaryKey?.includes(target.column) && target.primaryKey.length > 1) {
        deleteRowByPrimaryKey(db, target.table, target.primaryKey, row);
        const columns = Object.keys(row);
        const values = columns.map((column) => column === target.column ? toUserId : row[column]);
        const placeholders = columns.map(() => "?").join(", ");
        db.prepare(`INSERT OR IGNORE INTO ${target.table} (${columns.join(", ")}) VALUES (${placeholders})`).run(...values);
        return true;
    }
    if (typeof row.id === "string") {
        db.prepare(`UPDATE ${target.table} SET ${target.column} = ? WHERE id = ?`).run(toUserId, row.id);
        return true;
    }
    return false;
}
function getLocalUserConflictDiagnostics(input) {
    const normalizedEmail = (0, normalize_email_1.normalizeEmail)(input.email);
    const matches = input.users.listByEmail(normalizedEmail);
    const linked = input.users.getBySupabaseUserId(input.supabaseUserId);
    return {
        currentAuthUserId: input.supabaseUserId,
        normalizedEmail,
        linkedLocalUserId: linked?.id ?? null,
        matches: matches.map((user) => ({
            id: user.id,
            email: user.email,
            supabaseUserId: user.supabaseUserId,
            platformRole: user.platformRole,
            isActive: user.isActive,
        })),
    };
}
function getLocalIdentitySyncDiagnostics(input) {
    const conflict = getLocalUserConflictDiagnostics(input);
    const authoritative = input.users.getBySupabaseUserId(input.supabaseUserId);
    return {
        ...conflict,
        authoritativeLocalUserId: authoritative?.id ?? null,
        authoritativeSupabaseUserId: authoritative?.supabaseUserId ?? null,
        duplicateActiveEmailCount: conflict.matches.filter((match) => match.isActive).length,
    };
}
