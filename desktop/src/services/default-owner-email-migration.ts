import type { LocalDatabase } from "../database/connection";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import {
  DEFAULT_OWNER_EMAIL,
  HILDRETH_ADMIN_EMAIL,
  LEGACY_DEFAULT_OWNER_EMAILS,
  isHildrethAdminEmail,
  isLegacyPlaceholderOwnerEmail,
} from "../auth/default-owner-email";
import {
  LOCAL_DESKTOP_IDENTITY_SETTING_KEY,
  type LocalDesktopIdentity,
} from "../auth/local-desktop-identity";
import { normalizeEmail } from "../auth/normalize-email";

const DEFAULT_OWNER_EMAIL_MIGRATION_KEY = "neud.defaultOwnerEmailMigration_v1";

export type DefaultOwnerEmailMigrationResult = {
  updatedUsers: number;
  demotedLegacyOwners: number;
  deactivatedLegacyOwners: number;
  updatedIdentity: boolean;
  clearedAuthCache: boolean;
};

export function runDefaultOwnerEmailMigration(input: {
  db: LocalDatabase;
  settings: AppSettingsRepository;
}): DefaultOwnerEmailMigrationResult {
  const marker = input.db
    .prepare("SELECT value_json FROM app_settings WHERE key = ?")
    .get(DEFAULT_OWNER_EMAIL_MIGRATION_KEY) as { value_json: string } | undefined;

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
    } catch {
      // Re-run if marker is unreadable.
    }
  }

  const result: DefaultOwnerEmailMigrationResult = {
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

  if (
    result.updatedUsers > 0 ||
    result.demotedLegacyOwners > 0 ||
    result.deactivatedLegacyOwners > 0 ||
    result.updatedIdentity ||
    result.clearedAuthCache
  ) {
    console.info(
      `[owner-email-migration] updatedUsers=${result.updatedUsers} demotedLegacyOwners=${result.demotedLegacyOwners} deactivatedLegacyOwners=${result.deactivatedLegacyOwners} updatedIdentity=${result.updatedIdentity} clearedAuthCache=${result.clearedAuthCache}`,
    );
  }

  return result;
}

function migrateLocalUsers(
  db: LocalDatabase,
  result: DefaultOwnerEmailMigrationResult,
): void {
  const newEmail = normalizeEmail(DEFAULT_OWNER_EMAIL);
  const now = new Date().toISOString();

  const legacyOwners = db
    .prepare(
      `SELECT id, email
       FROM local_users
       WHERE platform_role = 'owner'
         AND lower(email) != ?
         AND lower(email) IN (${Array.from({ length: LEGACY_DEFAULT_OWNER_EMAILS.length }, () => "?").join(", ")})`,
    )
    .all(newEmail, ...LEGACY_DEFAULT_OWNER_EMAILS.map(normalizeEmail)) as Array<{
    id: string;
    email: string;
  }>;

  const existingNewOwner = db
    .prepare("SELECT id FROM local_users WHERE lower(email) = ?")
    .get(newEmail) as { id: string } | undefined;

  for (const owner of legacyOwners) {
    const email = normalizeEmail(owner.email);

    if (isHildrethAdminEmail(email)) {
      db.prepare(
        "UPDATE local_users SET email = ?, platform_role = 'user', is_active = 1, updated_at = ? WHERE id = ?",
      ).run(HILDRETH_ADMIN_EMAIL, now, owner.id);
      result.demotedLegacyOwners += 1;
      continue;
    }

    if (existingNewOwner && existingNewOwner.id !== owner.id) {
      if (isLegacyPlaceholderOwnerEmail(email)) {
        db.prepare(
          "UPDATE local_users SET is_active = 0, platform_role = 'user', updated_at = ? WHERE id = ?",
        ).run(now, owner.id);
        result.deactivatedLegacyOwners += 1;
      }
      continue;
    }

    if (isLegacyPlaceholderOwnerEmail(email)) {
      db.prepare(
        "UPDATE local_users SET email = ?, platform_role = 'owner', updated_at = ? WHERE id = ?",
      ).run(newEmail, now, owner.id);
      result.updatedUsers += 1;
    }
  }
}

function migrateStoredIdentity(settings: AppSettingsRepository): boolean {
  const current = settings.get<Partial<LocalDesktopIdentity> | null>(
    LOCAL_DESKTOP_IDENTITY_SETTING_KEY,
    null,
  );

  if (
    !current ||
    typeof current.email !== "string" ||
    !isLegacyPlaceholderOwnerEmail(current.email)
  ) {
    return false;
  }

  settings.set(LOCAL_DESKTOP_IDENTITY_SETTING_KEY, {
    ...current,
    email: DEFAULT_OWNER_EMAIL,
  });
  return true;
}

function migrateAuthCache(db: LocalDatabase): boolean {
  const row = db
    .prepare("SELECT email, role FROM auth_cache WHERE id = 1")
    .get() as { email: string; role: string } | undefined;

  if (!row || !isLegacyPlaceholderOwnerEmail(row.email)) {
    return false;
  }

  db.prepare("DELETE FROM auth_cache").run();
  return true;
}

function markMigrationDone(db: LocalDatabase): void {
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at`,
  ).run(DEFAULT_OWNER_EMAIL_MIGRATION_KEY, JSON.stringify("done"));
}
