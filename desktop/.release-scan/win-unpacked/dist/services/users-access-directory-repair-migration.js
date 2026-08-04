"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runUsersAccessDirectoryRepairMigration = runUsersAccessDirectoryRepairMigration;
const default_owner_email_1 = require("../auth/default-owner-email");
const normalize_email_1 = require("../auth/normalize-email");
const user_identity_reconciliation_service_1 = require("./user-identity-reconciliation-service");
const USERS_ACCESS_DIRECTORY_REPAIR_KEY = "neud.usersAccessDirectoryRepair_v1";
function runUsersAccessDirectoryRepairMigration(input) {
    const marker = input.db
        .prepare("SELECT value_json FROM app_settings WHERE key = ?")
        .get(USERS_ACCESS_DIRECTORY_REPAIR_KEY);
    if (marker) {
        try {
            if (JSON.parse(marker.value_json) === "done") {
                return emptyResult(true);
            }
        }
        catch {
            // Re-run if unreadable.
        }
    }
    const result = {
        alreadyApplied: false,
        reactivatedHildrethAdmin: false,
        ensuredHildrethTeamAdmin: false,
        demotedOwners: 0,
        deactivatedPlaceholders: 0,
        clearedStaleAuthCache: false,
        ambiguousUserIds: [],
        error: null,
    };
    try {
        input.db.transaction(() => {
            const repair = repairCanonicalUsers(input);
            result.reactivatedHildrethAdmin = repair.reactivatedHildrethAdmin;
            result.ensuredHildrethTeamAdmin = repair.ensuredHildrethTeamAdmin;
            result.demotedOwners = repair.demotedOwners;
            result.deactivatedPlaceholders = repair.deactivatedPlaceholders;
            result.ambiguousUserIds = repair.ambiguousUserIds;
            result.error = repair.error;
            if (result.error) {
                throw new Error(result.error);
            }
            result.clearedStaleAuthCache = clearStaleOwnerAuthCache(input.db, input.auth);
            markMigrationDone(input.db);
        });
    }
    catch (error) {
        result.error =
            error instanceof Error ? error.message : "Users access directory repair failed.";
        console.error(`[users-access-repair] ${result.error}`);
        if (result.ambiguousUserIds.length > 0) {
            console.error(`[users-access-repair] ambiguousUserIds=${result.ambiguousUserIds.join(", ")}`);
        }
        return result;
    }
    if (input.auth.isAccessAllowed()) {
        const reconciliation = (0, user_identity_reconciliation_service_1.reconcileAuthenticatedUser)(input);
        (0, user_identity_reconciliation_service_1.logIdentityReconciliation)(reconciliation);
        if (reconciliation.ensuredTeamAdmin) {
            result.ensuredHildrethTeamAdmin = true;
        }
    }
    console.info(`[users-access-repair] reactivatedHildrethAdmin=${result.reactivatedHildrethAdmin} ensuredHildrethTeamAdmin=${result.ensuredHildrethTeamAdmin} demotedOwners=${result.demotedOwners} deactivatedPlaceholders=${result.deactivatedPlaceholders} clearedStaleAuthCache=${result.clearedStaleAuthCache}`);
    return result;
}
function repairCanonicalUsers(input) {
    const ownerEmail = (0, normalize_email_1.normalizeEmail)(default_owner_email_1.DEFAULT_OWNER_EMAIL);
    const adminEmail = (0, normalize_email_1.normalizeEmail)(default_owner_email_1.HILDRETH_ADMIN_EMAIL);
    const now = new Date().toISOString();
    const ownerCandidates = input.users
        .listAll()
        .filter((user) => (0, normalize_email_1.normalizeEmail)(user.email) === ownerEmail);
    if (ownerCandidates.length > 1) {
        return {
            reactivatedHildrethAdmin: false,
            ensuredHildrethTeamAdmin: false,
            demotedOwners: 0,
            deactivatedPlaceholders: 0,
            ambiguousUserIds: ownerCandidates.map((user) => user.id),
            error: `Ambiguous owner records for ${default_owner_email_1.DEFAULT_OWNER_EMAIL}: ${ownerCandidates.map((user) => user.id).join(", ")}`,
        };
    }
    const hildrethCandidates = input.users
        .listAll()
        .filter((user) => (0, normalize_email_1.normalizeEmail)(user.email) === adminEmail);
    if (hildrethCandidates.length > 1) {
        return {
            reactivatedHildrethAdmin: false,
            ensuredHildrethTeamAdmin: false,
            demotedOwners: 0,
            deactivatedPlaceholders: 0,
            ambiguousUserIds: hildrethCandidates.map((user) => user.id),
            error: `Ambiguous Hildreth admin records for ${default_owner_email_1.HILDRETH_ADMIN_EMAIL}: ${hildrethCandidates.map((user) => user.id).join(", ")}`,
        };
    }
    const ownerUser = ownerCandidates[0] ?? null;
    const hildrethUser = hildrethCandidates[0] ?? null;
    if (ownerUser &&
        hildrethUser &&
        ownerUser.supabaseUserId &&
        hildrethUser.supabaseUserId &&
        ownerUser.supabaseUserId === hildrethUser.supabaseUserId) {
        return {
            reactivatedHildrethAdmin: false,
            ensuredHildrethTeamAdmin: false,
            demotedOwners: 0,
            deactivatedPlaceholders: 0,
            ambiguousUserIds: [ownerUser.id, hildrethUser.id],
            error: `Owner and Hildreth admin share the same Supabase UUID (${ownerUser.supabaseUserId}).`,
        };
    }
    let reactivatedHildrethAdmin = false;
    let ensuredHildrethTeamAdmin = false;
    let demotedOwners = 0;
    let deactivatedPlaceholders = 0;
    if (ownerUser) {
        input.users.updateIdentity({
            id: ownerUser.id,
            email: ownerEmail,
            platformRole: "owner",
            isActive: true,
        });
    }
    if (hildrethUser) {
        const wasInactive = !hildrethUser.isActive;
        input.users.updateIdentity({
            id: hildrethUser.id,
            email: adminEmail,
            platformRole: "user",
            isActive: true,
        });
        reactivatedHildrethAdmin = wasInactive || hildrethUser.platformRole === "owner";
        let team = input.teams
            .listAll()
            .find((entry) => entry.name === user_identity_reconciliation_service_1.HILDRETH_MEDIA_GROUP_TEAM_NAME) ?? null;
        if (!team) {
            team = input.teams.create({
                name: user_identity_reconciliation_service_1.HILDRETH_MEDIA_GROUP_TEAM_NAME,
                description: "Default team for Hildreth Media Group within NEUD.",
                createdByUserId: hildrethUser.id,
            });
        }
        input.teamMemberships.upsert({
            teamId: team.id,
            userId: hildrethUser.id,
            role: "admin",
            createdByUserId: ownerUser?.id ?? hildrethUser.id,
        });
        ensuredHildrethTeamAdmin = true;
    }
    for (const user of input.users.listAll()) {
        const email = (0, normalize_email_1.normalizeEmail)(user.email);
        if (email === ownerEmail) {
            continue;
        }
        if (email === adminEmail) {
            if (user.platformRole === "owner") {
                input.users.updateIdentity({
                    id: user.id,
                    platformRole: "user",
                    isActive: true,
                });
                demotedOwners += 1;
            }
            continue;
        }
        if (user.platformRole === "owner" && user.isActive) {
            if ((0, default_owner_email_1.isHildrethAdminEmail)(email) || (0, default_owner_email_1.isLegacyPlaceholderOwnerEmail)(email)) {
                input.users.updateIdentity({
                    id: user.id,
                    platformRole: "user",
                    isActive: (0, default_owner_email_1.isLegacyPlaceholderOwnerEmail)(email) ? false : true,
                });
                demotedOwners += 1;
                if ((0, default_owner_email_1.isLegacyPlaceholderOwnerEmail)(email)) {
                    deactivatedPlaceholders += 1;
                }
                continue;
            }
        }
        if ((0, default_owner_email_1.isLegacyPlaceholderOwnerEmail)(email) && user.isActive) {
            input.db
                .prepare("UPDATE local_users SET is_active = 0, platform_role = 'user', updated_at = ? WHERE id = ?")
                .run(now, user.id);
            deactivatedPlaceholders += 1;
        }
    }
    const activeOwners = input.users
        .listAll()
        .filter((user) => user.platformRole === "owner" && user.isActive);
    if (activeOwners.length > 1) {
        return {
            reactivatedHildrethAdmin,
            ensuredHildrethTeamAdmin,
            demotedOwners,
            deactivatedPlaceholders,
            ambiguousUserIds: activeOwners.map((user) => user.id),
            error: `Expected at most one active owner after repair, found ${activeOwners.length}.`,
        };
    }
    if (activeOwners.length === 1 &&
        (0, normalize_email_1.normalizeEmail)(activeOwners[0].email) !== ownerEmail) {
        return {
            reactivatedHildrethAdmin,
            ensuredHildrethTeamAdmin,
            demotedOwners,
            deactivatedPlaceholders,
            ambiguousUserIds: [activeOwners[0].id],
            error: `Active owner email mismatch: ${activeOwners[0].email}`,
        };
    }
    return {
        reactivatedHildrethAdmin,
        ensuredHildrethTeamAdmin,
        demotedOwners,
        deactivatedPlaceholders,
        ambiguousUserIds: [],
        error: null,
    };
}
function clearStaleOwnerAuthCache(db, auth) {
    const authUser = auth.getAuthenticatedUser();
    if (!authUser) {
        return false;
    }
    if (!(0, default_owner_email_1.shouldClearStaleOwnerAuthCache)(authUser.email, authUser.role)) {
        return false;
    }
    auth.clear();
    db.prepare("DELETE FROM auth_cache").run();
    return true;
}
function markMigrationDone(db) {
    db.prepare(`INSERT INTO app_settings (key, value_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at`).run(USERS_ACCESS_DIRECTORY_REPAIR_KEY, JSON.stringify("done"));
}
function emptyResult(alreadyApplied) {
    return {
        alreadyApplied,
        reactivatedHildrethAdmin: false,
        ensuredHildrethTeamAdmin: false,
        demotedOwners: 0,
        deactivatedPlaceholders: 0,
        clearedStaleAuthCache: false,
        ambiguousUserIds: [],
        error: null,
    };
}
