"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOwnerIdentitySyncMigration = runOwnerIdentitySyncMigration;
const default_owner_email_1 = require("../auth/default-owner-email");
const normalize_email_1 = require("../auth/normalize-email");
const user_identity_reconciliation_service_1 = require("./user-identity-reconciliation-service");
const OWNER_IDENTITY_SYNC_MIGRATION_KEY = "neud.ownerIdentitySyncMigration_v1";
function runOwnerIdentitySyncMigration(input) {
    const marker = input.db
        .prepare("SELECT value_json FROM app_settings WHERE key = ?")
        .get(OWNER_IDENTITY_SYNC_MIGRATION_KEY);
    if (marker) {
        try {
            if (JSON.parse(marker.value_json) === "done") {
                return {
                    alreadyApplied: true,
                    repairedUsers: 0,
                    demotedOwners: 0,
                    linkedSupabaseIds: 0,
                    ensuredHildrethAdmin: false,
                    clearedAuthCache: false,
                };
            }
        }
        catch {
            // Re-run if unreadable.
        }
    }
    const result = {
        alreadyApplied: false,
        repairedUsers: 0,
        demotedOwners: 0,
        linkedSupabaseIds: 0,
        ensuredHildrethAdmin: false,
        clearedAuthCache: false,
    };
    input.db.transaction(() => {
        result.repairedUsers += repairKnownAccounts(input);
        result.demotedOwners += demoteStaleOwners(input.users);
        result.linkedSupabaseIds += linkAuthCacheUser(input);
        result.clearedAuthCache = clearLegacyOwnerAuthCache(input.db, input.auth);
        markMigrationDone(input.db);
    });
    if (input.auth.isAccessAllowed()) {
        const reconciliation = (0, user_identity_reconciliation_service_1.reconcileAuthenticatedUser)(input);
        (0, user_identity_reconciliation_service_1.logIdentityReconciliation)(reconciliation);
        result.demotedOwners += reconciliation.demotedOwners;
        result.ensuredHildrethAdmin = reconciliation.ensuredTeamAdmin;
    }
    console.info(`[owner-identity-sync] repairedUsers=${result.repairedUsers} demotedOwners=${result.demotedOwners} linkedSupabaseIds=${result.linkedSupabaseIds} ensuredHildrethAdmin=${result.ensuredHildrethAdmin} clearedAuthCache=${result.clearedAuthCache}`);
    return result;
}
function repairKnownAccounts(input) {
    let repaired = 0;
    const ownerEmail = (0, normalize_email_1.normalizeEmail)(default_owner_email_1.DEFAULT_OWNER_EMAIL);
    const adminEmail = (0, normalize_email_1.normalizeEmail)(default_owner_email_1.HILDRETH_ADMIN_EMAIL);
    const ownerUser = input.users.getByEmail(ownerEmail);
    if (ownerUser) {
        input.users.updateIdentity({
            id: ownerUser.id,
            email: ownerEmail,
            platformRole: "owner",
            isActive: true,
        });
        repaired += 1;
    }
    const adminUser = input.users.getByEmail(adminEmail);
    if (adminUser) {
        input.users.updateIdentity({
            id: adminUser.id,
            email: adminEmail,
            platformRole: "user",
            isActive: true,
        });
        repaired += 1;
        let team = input.teams
            .listAll()
            .find((entry) => entry.name === user_identity_reconciliation_service_1.HILDRETH_MEDIA_GROUP_TEAM_NAME) ?? null;
        if (!team) {
            team = input.teams.create({
                name: user_identity_reconciliation_service_1.HILDRETH_MEDIA_GROUP_TEAM_NAME,
                description: "Default team for Hildreth Media Group within NEUD.",
                createdByUserId: adminUser.id,
            });
        }
        input.teamMemberships.upsert({
            teamId: team.id,
            userId: adminUser.id,
            role: "admin",
            createdByUserId: adminUser.id,
        });
    }
    return repaired;
}
function demoteStaleOwners(users) {
    const ownerEmail = (0, normalize_email_1.normalizeEmail)(default_owner_email_1.DEFAULT_OWNER_EMAIL);
    let demoted = 0;
    for (const user of users.listAll()) {
        if (!user.isActive || user.platformRole !== "owner") {
            continue;
        }
        const email = (0, normalize_email_1.normalizeEmail)(user.email);
        if (email === ownerEmail) {
            continue;
        }
        if ((0, default_owner_email_1.isLegacyPlaceholderOwnerEmail)(email) || (0, default_owner_email_1.isHildrethAdminEmail)(email)) {
            users.updateIdentity({
                id: user.id,
                platformRole: "user",
                isActive: user.isActive,
            });
            demoted += 1;
        }
    }
    return demoted;
}
function linkAuthCacheUser(input) {
    const authUser = input.auth.getAuthenticatedUser();
    if (!authUser) {
        return 0;
    }
    const localUser = input.users.getByEmail((0, normalize_email_1.normalizeEmail)(authUser.email)) ??
        input.users.resolveByAuthUserId(authUser.userId);
    if (!localUser) {
        return 0;
    }
    if (localUser.supabaseUserId === authUser.userId) {
        return 0;
    }
    input.users.updateIdentity({
        id: localUser.id,
        supabaseUserId: authUser.userId,
        isActive: localUser.isActive,
    });
    return 1;
}
function clearLegacyOwnerAuthCache(db, auth) {
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
       updated_at = excluded.updated_at`).run(OWNER_IDENTITY_SYNC_MIGRATION_KEY, JSON.stringify("done"));
}
