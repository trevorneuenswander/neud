"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_DEFAULT_OWNER_EMAILS = exports.LEGACY_PLACEHOLDER_OWNER_EMAILS = exports.HILDRETH_ADMIN_EMAIL = exports.DEFAULT_OWNER_EMAIL = void 0;
exports.isHildrethAdminEmail = isHildrethAdminEmail;
exports.isLegacyPlaceholderOwnerEmail = isLegacyPlaceholderOwnerEmail;
exports.isLegacyDefaultOwnerEmail = isLegacyDefaultOwnerEmail;
exports.shouldClearStaleOwnerAuthCache = shouldClearStaleOwnerAuthCache;
exports.DEFAULT_OWNER_EMAIL = "trevorneuenswander@gmail.com";
exports.HILDRETH_ADMIN_EMAIL = "trevor@hildrethmedia.com";
/** Disposable bootstrap identities that may be deactivated during owner migration. */
exports.LEGACY_PLACEHOLDER_OWNER_EMAILS = [
    "local@neud.desktop",
    "owner@neud.local",
];
/** Emails that historically served as the default owner before canonical owner migration. */
exports.LEGACY_DEFAULT_OWNER_EMAILS = [
    exports.HILDRETH_ADMIN_EMAIL,
    ...exports.LEGACY_PLACEHOLDER_OWNER_EMAILS,
];
function normalize(email) {
    return email.trim().toLowerCase();
}
function isHildrethAdminEmail(email) {
    return normalize(email) === normalize(exports.HILDRETH_ADMIN_EMAIL);
}
function isLegacyPlaceholderOwnerEmail(email) {
    const normalized = normalize(email);
    return exports.LEGACY_PLACEHOLDER_OWNER_EMAILS.some((legacy) => legacy === normalized);
}
function isLegacyDefaultOwnerEmail(email) {
    const normalized = normalize(email);
    return exports.LEGACY_DEFAULT_OWNER_EMAILS.some((legacy) => legacy === normalized);
}
function shouldClearStaleOwnerAuthCache(email, role) {
    const normalizedEmail = normalize(email);
    const normalizedRole = role.trim().toLowerCase();
    if (normalizedRole !== "owner") {
        return false;
    }
    return (isLegacyPlaceholderOwnerEmail(normalizedEmail) || isHildrethAdminEmail(normalizedEmail));
}
