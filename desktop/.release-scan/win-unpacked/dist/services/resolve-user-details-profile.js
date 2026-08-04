"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPlatformRoleLabel = formatPlatformRoleLabel;
exports.resolveUserDetailsFields = resolveUserDetailsFields;
const user_identity_reconciliation_service_1 = require("./user-identity-reconciliation-service");
function pickTrimmed(...values) {
    for (const value of values) {
        const trimmed = value?.trim();
        if (trimmed) {
            return trimmed;
        }
    }
    return null;
}
function formatPlatformRoleLabel(role) {
    const normalized = role.trim().toLowerCase();
    if (normalized === "user") {
        return "Operator";
    }
    if (normalized.length === 0) {
        return "Viewer";
    }
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
function resolveUserDetailsFields(input) {
    const fullName = pickTrimmed(input.supabaseFullName, input.localFullName) ?? "Name not set";
    const email = pickTrimmed(input.supabaseEmail, input.localEmail) ?? "Not provided";
    const phoneNumber = pickTrimmed(input.supabasePhoneNumber, input.localPhone);
    const teamName = pickTrimmed(input.supabaseTeam, input.localProfileTeam);
    const resolvedRole = pickTrimmed(input.supabaseRole, input.localPlatformRole ?? null) ?? "viewer";
    const roleLabel = formatPlatformRoleLabel(resolvedRole);
    const platformRole = (0, user_identity_reconciliation_service_1.mapSupabaseProfileRoleToPlatformRole)(resolvedRole);
    return {
        fullName,
        email,
        phoneNumber,
        teamName,
        platformRole,
        roleLabel,
        source: input.source,
    };
}
