import type { LocalDatabase } from "../database/connection";
import type { AuthLicenseManager } from "./auth-license-manager";
import type { LocalUsersRepository } from "../repositories/local-users-repository";
import type { TeamsRepository } from "../repositories/teams-repository";
import type { TeamMembershipsRepository } from "../repositories/team-memberships-repository";
import {
  DEFAULT_OWNER_EMAIL,
  HILDRETH_ADMIN_EMAIL,
  isHildrethAdminEmail,
  isLegacyPlaceholderOwnerEmail,
  shouldClearStaleOwnerAuthCache,
} from "../auth/default-owner-email";
import { normalizeEmail } from "../auth/normalize-email";
import {
  HILDRETH_MEDIA_GROUP_TEAM_NAME,
  logIdentityReconciliation,
  reconcileAuthenticatedUser,
} from "./user-identity-reconciliation-service";

const OWNER_IDENTITY_SYNC_MIGRATION_KEY = "neud.ownerIdentitySyncMigration_v1";

export type OwnerIdentitySyncMigrationResult = {
  alreadyApplied: boolean;
  repairedUsers: number;
  demotedOwners: number;
  linkedSupabaseIds: number;
  ensuredHildrethAdmin: boolean;
  clearedAuthCache: boolean;
};

export function runOwnerIdentitySyncMigration(input: {
  db: LocalDatabase;
  auth: AuthLicenseManager;
  users: LocalUsersRepository;
  teams: TeamsRepository;
  teamMemberships: TeamMembershipsRepository;
}): OwnerIdentitySyncMigrationResult {
  const marker = input.db
    .prepare("SELECT value_json FROM app_settings WHERE key = ?")
    .get(OWNER_IDENTITY_SYNC_MIGRATION_KEY) as { value_json: string } | undefined;

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
    } catch {
      // Re-run if unreadable.
    }
  }

  const result: OwnerIdentitySyncMigrationResult = {
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
    const reconciliation = reconcileAuthenticatedUser(input);
    logIdentityReconciliation(reconciliation);
    result.demotedOwners += reconciliation.demotedOwners;
    result.ensuredHildrethAdmin = reconciliation.ensuredTeamAdmin;
  }

  console.info(
    `[owner-identity-sync] repairedUsers=${result.repairedUsers} demotedOwners=${result.demotedOwners} linkedSupabaseIds=${result.linkedSupabaseIds} ensuredHildrethAdmin=${result.ensuredHildrethAdmin} clearedAuthCache=${result.clearedAuthCache}`,
  );

  return result;
}

function repairKnownAccounts(input: {
  users: LocalUsersRepository;
  teams: TeamsRepository;
  teamMemberships: TeamMembershipsRepository;
}): number {
  let repaired = 0;
  const ownerEmail = normalizeEmail(DEFAULT_OWNER_EMAIL);
  const adminEmail = normalizeEmail(HILDRETH_ADMIN_EMAIL);

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

    let team =
      input.teams
        .listAll()
        .find((entry) => entry.name === HILDRETH_MEDIA_GROUP_TEAM_NAME) ?? null;
    if (!team) {
      team = input.teams.create({
        name: HILDRETH_MEDIA_GROUP_TEAM_NAME,
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

function demoteStaleOwners(users: LocalUsersRepository): number {
  const ownerEmail = normalizeEmail(DEFAULT_OWNER_EMAIL);
  let demoted = 0;

  for (const user of users.listAll()) {
    if (!user.isActive || user.platformRole !== "owner") {
      continue;
    }
    const email = normalizeEmail(user.email);
    if (email === ownerEmail) {
      continue;
    }
    if (isLegacyPlaceholderOwnerEmail(email) || isHildrethAdminEmail(email)) {
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

function linkAuthCacheUser(input: {
  db: LocalDatabase;
  auth: AuthLicenseManager;
  users: LocalUsersRepository;
}): number {
  const authUser = input.auth.getAuthenticatedUser();
  if (!authUser) {
    return 0;
  }

  const localUser =
    input.users.getByEmail(normalizeEmail(authUser.email)) ??
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

function clearLegacyOwnerAuthCache(
  db: LocalDatabase,
  auth: AuthLicenseManager,
): boolean {
  const authUser = auth.getAuthenticatedUser();
  if (!authUser) {
    return false;
  }

  if (!shouldClearStaleOwnerAuthCache(authUser.email, authUser.role)) {
    return false;
  }

  auth.clear();
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
  ).run(OWNER_IDENTITY_SYNC_MIGRATION_KEY, JSON.stringify("done"));
}
