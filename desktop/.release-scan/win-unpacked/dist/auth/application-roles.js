"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_RANK = exports.APPLICATION_ROLES = void 0;
exports.normalizeApplicationRole = normalizeApplicationRole;
exports.getApplicationRole = getApplicationRole;
exports.roleRank = roleRank;
exports.formatApplicationRole = formatApplicationRole;
exports.toPersistedApplicationRole = toPersistedApplicationRole;
exports.isElevatedApplicationRole = isElevatedApplicationRole;
exports.APPLICATION_ROLES = [
    "owner",
    "admin",
    "operator",
    "viewer",
];
exports.ROLE_RANK = {
    viewer: 1,
    operator: 2,
    admin: 3,
    owner: 4,
};
const LEGACY_ROLE_MAP = {
    owner: "owner",
    organization_owner: "owner",
    admin: "admin",
    operator: "operator",
    user: "operator",
    member: "operator",
    viewer: "viewer",
};
function normalizeApplicationRole(raw) {
    if (!raw) {
        return "viewer";
    }
    const normalized = raw.trim().toLowerCase();
    return LEGACY_ROLE_MAP[normalized] ?? "viewer";
}
function getApplicationRole(user) {
    return normalizeApplicationRole(user?.role);
}
function roleRank(role) {
    return exports.ROLE_RANK[role];
}
function formatApplicationRole(role) {
    const normalized = normalizeApplicationRole(role);
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
function toPersistedApplicationRole(role) {
    const normalized = normalizeApplicationRole(role);
    if (!exports.APPLICATION_ROLES.includes(normalized)) {
        return "viewer";
    }
    return normalized;
}
function isElevatedApplicationRole(role) {
    return role === "owner" || role === "admin";
}
