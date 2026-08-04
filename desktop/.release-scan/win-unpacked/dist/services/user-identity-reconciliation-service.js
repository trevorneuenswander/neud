"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HILDRETH_ADMIN_EMAIL = exports.HILDRETH_MEDIA_GROUP_TEAM_NAME = void 0;
exports.mapSupabaseProfileRoleToPlatformRole = mapSupabaseProfileRoleToPlatformRole;
exports.mapSupabaseProfileRoleToAuthCacheRole = mapSupabaseProfileRoleToAuthCacheRole;
exports.reconcileAuthenticatedUser = reconcileAuthenticatedUser;
exports.logIdentityReconciliation = logIdentityReconciliation;
exports.getIdentityDiagnostics = getIdentityDiagnostics;
const default_owner_email_1 = require("../auth/default-owner-email");
Object.defineProperty(exports, "HILDRETH_ADMIN_EMAIL", { enumerable: true, get: function () { return default_owner_email_1.HILDRETH_ADMIN_EMAIL; } });
const normalize_email_1 = require("../auth/normalize-email");
const local_user_identity_reconciliation_1 = require("./local-user-identity-reconciliation");
exports.HILDRETH_MEDIA_GROUP_TEAM_NAME = "Hildreth Media Group";
function mapSupabaseProfileRoleToPlatformRole(supabaseRole) {
    return supabaseRole?.trim().toLowerCase() === "owner" ? "owner" : "user";
}
function mapSupabaseProfileRoleToAuthCacheRole(supabaseRole) {
    return mapSupabaseProfileRoleToPlatformRole(supabaseRole) === "owner" ? "owner" : "user";
}
function reconcileAuthenticatedUser(input) {
    const authUser = input.auth.getAuthenticatedUser();
    if (!authUser) {
        return emptyResult("skipped");
    }
    const supabaseUserId = authUser.userId;
    const normalizedEmail = (0, normalize_email_1.normalizeEmail)(authUser.email);
    let localUser = input.users.resolveByAuthUserId(supabaseUserId) ??
        input.users.getByEmail(normalizedEmail);
    const displayName = authUser.displayName?.trim() ||
        localUser?.fullName?.trim() ||
        normalizedEmail.split("@")[0] ||
        "NEUD User";
    const platformRole = resolveCanonicalPlatformRole({
        normalizedEmail,
        supabaseRole: authUser.role,
        currentPlatformRole: localUser?.platformRole ?? "user",
    });
    const syncResult = (0, local_user_identity_reconciliation_1.reconcileLocalUserIdentitySync)({
        db: input.db,
        users: input.users,
        supabaseUserId,
        email: normalizedEmail,
        fullName: displayName,
        platformRole,
        previousAuthUserId: localUser && localUser.id !== supabaseUserId ? localUser.id : null,
    });
    let identitySource = "supabase_uuid";
    if (syncResult.status === "reconciled") {
        identitySource = "email";
        localUser = input.users.getById(syncResult.userId);
    }
    else if (syncResult.status === "synced") {
        identitySource = localUser ? "email" : "created";
        localUser = input.users.getById(syncResult.userId);
    }
    else if (localUser) {
        input.users.deactivateDuplicateByEmail(localUser.id, normalizedEmail);
        identitySource = localUser.supabaseUserId === supabaseUserId ? "supabase_uuid" : "email";
        localUser = input.users.updateIdentity({
            id: localUser.id,
            email: normalizedEmail,
            fullName: displayName,
            supabaseUserId,
            platformRole,
            isActive: true,
        });
    }
    else {
        localUser = input.users.upsert({
            id: supabaseUserId,
            email: normalizedEmail,
            fullName: displayName,
            platformRole,
            supabaseUserId,
            isActive: true,
        });
        identitySource = "created";
    }
    if (!localUser) {
        return emptyResult("skipped");
    }
    const demotedOwners = demoteNonCanonicalOwners(input.users, localUser.id, normalizedEmail);
    const canonicalUser = input.users.getById(localUser.id);
    const ensuredTeamAdmin = ensureHildrethTeamAdmin({
        users: input.users,
        teams: input.teams,
        teamMemberships: input.teamMemberships,
        userId: canonicalUser.id,
        normalizedEmail,
    });
    const authCacheRole = canonicalUser.platformRole === "owner" ? "owner" : "user";
    const updatedAuthCacheRole = input.auth.updateCachedRole(authCacheRole);
    return {
        linkedUserId: canonicalUser.id,
        supabaseUserId,
        platformRole: canonicalUser.platformRole,
        demotedOwners,
        ensuredTeamAdmin,
        updatedAuthCacheRole,
        identitySource,
    };
}
function resolveCanonicalPlatformRole(input) {
    if (input.normalizedEmail === (0, normalize_email_1.normalizeEmail)(default_owner_email_1.DEFAULT_OWNER_EMAIL)) {
        return "owner";
    }
    if ((0, default_owner_email_1.isHildrethAdminEmail)(input.normalizedEmail) ||
        (0, default_owner_email_1.isLegacyPlaceholderOwnerEmail)(input.normalizedEmail)) {
        return "user";
    }
    return mapSupabaseProfileRoleToPlatformRole(input.supabaseRole);
}
function demoteNonCanonicalOwners(users, canonicalUserId, canonicalEmail) {
    let demoted = 0;
    for (const user of users.listAll()) {
        if (user.platformRole !== "owner" || !user.isActive) {
            continue;
        }
        if (user.id === canonicalUserId) {
            continue;
        }
        if ((0, normalize_email_1.normalizeEmail)(user.email) === canonicalEmail) {
            continue;
        }
        users.updateIdentity({
            id: user.id,
            platformRole: "user",
            isActive: user.isActive,
        });
        demoted += 1;
    }
    return demoted;
}
function ensureHildrethTeamAdmin(input) {
    if (input.normalizedEmail !== (0, normalize_email_1.normalizeEmail)(default_owner_email_1.HILDRETH_ADMIN_EMAIL)) {
        return false;
    }
    let team = input.teams
        .listAll()
        .find((entry) => entry.name === exports.HILDRETH_MEDIA_GROUP_TEAM_NAME) ?? null;
    if (!team) {
        team = input.teams.create({
            name: exports.HILDRETH_MEDIA_GROUP_TEAM_NAME,
            description: "Default team for Hildreth Media Group within NEUD.",
            createdByUserId: input.userId,
        });
    }
    input.teamMemberships.upsert({
        teamId: team.id,
        userId: input.userId,
        role: "admin",
        createdByUserId: input.userId,
    });
    return true;
}
function emptyResult(identitySource) {
    return {
        linkedUserId: null,
        supabaseUserId: null,
        platformRole: null,
        demotedOwners: 0,
        ensuredTeamAdmin: false,
        updatedAuthCacheRole: false,
        identitySource,
    };
}
function logIdentityReconciliation(result) {
    if (result.identitySource === "skipped") {
        return;
    }
    console.info(`[identity-reconciliation] source=${result.identitySource} userId=${result.linkedUserId ?? "none"} supabaseUserId=${result.supabaseUserId ?? "none"} platformRole=${result.platformRole ?? "none"} demotedOwners=${result.demotedOwners} ensuredTeamAdmin=${result.ensuredTeamAdmin} updatedAuthCacheRole=${result.updatedAuthCacheRole}`);
}
function getIdentityDiagnostics(input) {
    const authUser = input.auth.getAuthenticatedUser();
    if (!authUser) {
        return null;
    }
    const localUser = input.users.resolveByAuthUserId(authUser.userId);
    const memberships = localUser
        ? input.teamMemberships.listForUser(localUser.id).flatMap((membership) => {
            const team = input.teams.getById(membership.teamId);
            if (!team) {
                return [];
            }
            return [{
                    teamId: team.id,
                    teamName: team.name,
                    role: membership.role,
                }];
        })
        : [];
    return {
        supabaseUserId: authUser.userId,
        neudUserId: localUser?.id ?? null,
        email: authUser.email,
        globalRole: localUser?.platformRole ?? mapSupabaseProfileRoleToPlatformRole(authUser.role),
        teamMemberships: memberships,
        effectiveProjectCount: input.accessibleProjectCount,
        identitySource: input.identitySource ?? "runtime",
        cacheRefreshedAt: authUser.lastVerifiedAt,
    };
}
