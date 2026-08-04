"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_DESKTOP_IDENTITY_SETTING_KEY = void 0;
exports.abbreviateUserId = abbreviateUserId;
exports.getOrCreateLocalDesktopIdentity = getOrCreateLocalDesktopIdentity;
const crypto_1 = require("crypto");
const default_owner_email_1 = require("./default-owner-email");
exports.LOCAL_DESKTOP_IDENTITY_SETTING_KEY = "neud.localIdentity";
function abbreviateUserId(userId) {
    return userId.length <= 8 ? userId : `${userId.slice(0, 8)}…`;
}
function getOrCreateLocalDesktopIdentity(settings) {
    const existing = readStoredIdentity(settings);
    if (existing) {
        return { identity: existing, created: false };
    }
    const identity = {
        userId: (0, crypto_1.randomUUID)(),
        email: default_owner_email_1.DEFAULT_OWNER_EMAIL,
        displayName: "Local NEUD Owner",
        isLocalDesktopUser: true,
    };
    settings.set(exports.LOCAL_DESKTOP_IDENTITY_SETTING_KEY, identity);
    return { identity, created: true };
}
function readStoredIdentity(settings) {
    const current = settings.get(exports.LOCAL_DESKTOP_IDENTITY_SETTING_KEY, null);
    if (isValidIdentity(current)) {
        if ((0, default_owner_email_1.isLegacyPlaceholderOwnerEmail)(current.email)) {
            const migrated = {
                ...current,
                email: default_owner_email_1.DEFAULT_OWNER_EMAIL,
            };
            settings.set(exports.LOCAL_DESKTOP_IDENTITY_SETTING_KEY, migrated);
            return migrated;
        }
        return current;
    }
    return null;
}
function isValidIdentity(value) {
    return Boolean(value &&
        typeof value.userId === "string" &&
        value.userId.length > 0 &&
        typeof value.email === "string" &&
        value.email.length > 0 &&
        typeof value.displayName === "string" &&
        value.displayName.length > 0 &&
        value.isLocalDesktopUser === true);
}
