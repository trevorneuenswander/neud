"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDefaultOwnerEmailMigration = runDefaultOwnerEmailMigration;
const default_owner_email_1 = require("../auth/default-owner-email");
const local_desktop_identity_1 = require("../auth/local-desktop-identity");
const normalize_email_1 = require("../auth/normalize-email");
const DEFAULT_OWNER_EMAIL_MIGRATION_KEY = "neud.defaultOwnerEmailMigration_v1";
function runDefaultOwnerEmailMigration(input) {
    const marker = input.db
        .prepare("SELECT value_json FROM app_settings WHERE key = ?")
        .get(DEFAULT_OWNER_EMAIL_MIGRATION_KEY);
    if (marker) {
        try {
            if (JSON.parse(marker.value_json) === "done") {
                return {
                    updatedUsers: 0,
                    demotedLegacyOwners: 0,
                    deactivatedLegacyOwners: 0,
                    updatedIdentity: false,
                    clearedAuthCache: false,
                };
            }
        }
        catch {
            // Re-run if marker is unreadable.
        }
    }
    const result = {
        updatedUsers: 0,
        demotedLegacyOwners: 0,
        deactivatedLegacyOwners: 0,
        updatedIdentity: false,
        clearedAuthCache: false,
    };
    input.db.transaction(() => {
        migrateLocalUsers(input.db, result);
        result.updatedIdentity = migrateStoredIdentity(input.settings);
        result.clearedAuthCache = migrateAuthCache(input.db);
        markMigrationDone(input.db);
    });
    if (result.updatedUsers > 0 ||
        result.demotedLegacyOwners > 0 ||
        result.deactivatedLegacyOwners > 0 ||
        result.updatedIdentity ||
        result.clearedAuthCache) {
        console.info(`[owner-email-migration] updatedUsers=${result.updatedUsers} demotedLegacyOwners=${result.demotedLegacyOwners} deactivatedLegacyOwners=${result.deactivatedLegacyOwners} updatedIdentity=${result.updatedIdentity} clearedAuthCache=${result.clearedAuthCache}`);
    }
    return result;
}
function migrateLocalUsers(db, result) {
    const newEmail = (0, normalize_email_1.normalizeEmail)(default_owner_email_1.DEFAULT_OWNER_EMAIL);
    const now = new Date().toISOString();
    const legacyOwners = db
        .prepare(`SELECT id, email
       FROM local_users
       WHERE platform_role = 'owner'
         AND lower(email) != ?
         AND lower(email) IN (${Array.from({ length: default_owner_email_1.LEGACY_DEFAULT_OWNER_EMAILS.length }, () => "?").join(", ")})`)
        .all(newEmail, ...default_owner_email_1.LEGACY_DEFAULT_OWNER_EMAILS.map(normalize_email_1.normalizeEmail));
    const existingNewOwner = db
        .prepare("SELECT id FROM local_users WHERE lower(email) = ?")
        .get(newEmail);
    for (const owner of legacyOwners) {
        const email = (0, normalize_email_1.normalizeEmail)(owner.email);
        if ((0, default_owner_email_1.isHildrethAdminEmail)(email)) {
            db.prepare("UPDATE local_users SET email = ?, platform_role = 'user', is_active = 1, updated_at = ? WHERE id = ?").run(default_owner_email_1.HILDRETH_ADMIN_EMAIL, now, owner.id);
            result.demotedLegacyOwners += 1;
            continue;
        }
        if (existingNewOwner && existingNewOwner.id !== owner.id) {
            if ((0, default_owner_email_1.isLegacyPlaceholderOwnerEmail)(email)) {
                db.prepare("UPDATE local_users SET is_active = 0, platform_role = 'user', updated_at = ? WHERE id = ?").run(now, owner.id);
                result.deactivatedLegacyOwners += 1;
            }
            continue;
        }
        if ((0, default_owner_email_1.isLegacyPlaceholderOwnerEmail)(email)) {
            db.prepare("UPDATE local_users SET email = ?, platform_role = 'owner', updated_at = ? WHERE id = ?").run(newEmail, now, owner.id);
            result.updatedUsers += 1;
        }
    }
}
function migrateStoredIdentity(settings) {
    const current = settings.get(local_desktop_identity_1.LOCAL_DESKTOP_IDENTITY_SETTING_KEY, null);
    if (!current ||
        typeof current.email !== "string" ||
        !(0, default_owner_email_1.isLegacyPlaceholderOwnerEmail)(current.email)) {
        return false;
    }
    settings.set(local_desktop_identity_1.LOCAL_DESKTOP_IDENTITY_SETTING_KEY, {
        ...current,
        email: default_owner_email_1.DEFAULT_OWNER_EMAIL,
    });
    return true;
}
function migrateAuthCache(db) {
    const row = db
        .prepare("SELECT email, role FROM auth_cache WHERE id = 1")
        .get();
    if (!row || !(0, default_owner_email_1.isLegacyPlaceholderOwnerEmail)(row.email)) {
        return false;
    }
    db.prepare("DELETE FROM auth_cache").run();
    return true;
}
function markMigrationDone(db) {
    db.prepare(`INSERT INTO app_settings (key, value_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at`).run(DEFAULT_OWNER_EMAIL_MIGRATION_KEY, JSON.stringify("done"));
}
