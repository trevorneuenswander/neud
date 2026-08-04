"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePrimaryMembershipTeamName = resolvePrimaryMembershipTeamName;
exports.mergeOptionalProfileString = mergeOptionalProfileString;
exports.resolveAuthenticatedProfile = resolveAuthenticatedProfile;
exports.logIdentityResolutionDiagnostics = logIdentityResolutionDiagnostics;
function resolvePrimaryMembershipTeamName(memberships) {
    const activeNames = memberships
        .filter((membership) => membership.isActive && membership.teamIsActive)
        .map((membership) => membership.teamName.trim())
        .filter((name) => name.length > 0)
        .sort((left, right) => left.localeCompare(right));
    return activeNames[0] ?? null;
}
function pickNonEmptyString(...values) {
    for (const value of values) {
        const trimmed = value?.trim();
        if (trimmed) {
            return trimmed;
        }
    }
    return null;
}
function mergeOptionalProfileString(existing, incoming) {
    if (incoming === undefined) {
        return existing;
    }
    const trimmed = incoming?.trim();
    if (trimmed) {
        return trimmed;
    }
    return existing;
}
function resolveAuthenticatedProfile(input) {
    const authUser = input.auth.getAuthenticatedUser();
    const authStatus = input.auth.getStatus();
    if (!authUser || !authStatus.allowed) {
        return {
            authUserId: null,
            email: null,
            fullName: null,
            team: null,
            role: null,
            localUserId: null,
            status: "loading-session",
            source: "none",
            authUserIdMismatch: false,
            primaryMembershipTeamName: null,
        };
    }
    const context = input.accessAuthorization?.getAuthorizationContext(authUser.userId) ?? null;
    const localUserByAuth = input.users.resolveByAuthUserId(authUser.userId) ??
        input.users.getById(authUser.userId) ??
        (authUser.email ? input.users.getByEmail(authUser.email) : null);
    const authUserIdMismatch = Boolean(localUserByAuth &&
        localUserByAuth.supabaseUserId &&
        localUserByAuth.supabaseUserId !== authUser.userId);
    const primaryMembershipTeamName = context
        ? resolvePrimaryMembershipTeamName(context.teamMemberships)
        : null;
    const fullName = pickNonEmptyString(authUser.displayName, context?.displayName, localUserByAuth?.fullName);
    const team = pickNonEmptyString(authUser.team, localUserByAuth?.profileTeam);
    const role = context?.platformRole === "owner"
        ? "owner"
        : pickNonEmptyString(authStatus.role, context?.platformRole ?? null);
    let source = "none";
    if (fullName || team) {
        const fromCache = Boolean(authUser.displayName?.trim() || authUser.team?.trim());
        const fromLocalUser = Boolean(!authUser.displayName?.trim() && (context?.displayName?.trim() || localUserByAuth?.fullName?.trim()));
        const fromMembership = Boolean(!authUser.team?.trim() && primaryMembershipTeamName);
        if ((fromCache && fromLocalUser) || (fromCache && fromMembership) || (fromLocalUser && fromMembership)) {
            source = "merged";
        }
        else if (fromCache) {
            source = "remote-cache";
        }
        else if (fromLocalUser) {
            source = "local-user";
        }
        else if (fromMembership) {
            source = "team-membership";
        }
    }
    let status = "ready";
    if (!localUserByAuth && !fullName) {
        status = "missing-profile";
    }
    else if (authStatus.mode === "offline") {
        status = "offline-ready";
    }
    else if (!fullName && !team && authStatus.requiresOnlineVerification) {
        status = "loading-profile";
    }
    return {
        authUserId: authUser.userId,
        email: authUser.email,
        fullName,
        team,
        role,
        localUserId: context?.userId ?? localUserByAuth?.id ?? null,
        status,
        source,
        authUserIdMismatch,
        primaryMembershipTeamName,
    };
}
function logIdentityResolutionDiagnostics(profile, authUser) {
    if (process.env.NODE_ENV === "production") {
        return;
    }
    console.info(`[identity-resolution] status=${profile.status} source=${profile.source} authUserId=${profile.authUserId ?? "none"} localUserId=${profile.localUserId ?? "none"} fullName=${profile.fullName ? "set" : "missing"} team=${profile.team ? "set" : "missing"} role=${profile.role ?? "none"} mismatch=${profile.authUserIdMismatch} cachedName=${authUser?.displayName ? "set" : "missing"} cachedTeam=${authUser?.team ? "set" : "missing"}`);
    if (profile.authUserIdMismatch) {
        console.warn("[identity-resolution] Authenticated Supabase user ID does not match the linked local profile record.");
    }
    if (profile.status === "missing-profile") {
        console.warn("[identity-resolution] Authenticated session exists but no profile identity could be resolved.");
    }
}
