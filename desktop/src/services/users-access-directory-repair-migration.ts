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

const USERS_ACCESS_DIRECTORY_REPAIR_KEY = "neud.usersAccessDirectoryRepair_v1";

export type UsersAccessDirectoryRepairResult = {
  alreadyApplied: boolean;
  reactivatedHildrethAdmin: boolean;
  ensuredHildrethTeamAdmin: boolean;
  demotedOwners: number;
  deactivatedPlaceholders: number;
  clearedStaleAuthCache: boolean;
  ambiguousUserIds: string[];
  error: string | null;
};

export function runUsersAccessDirectoryRepairMigration(input: {
  db: LocalDatabase;
  auth: AuthLicenseManager;
  users: LocalUsersRepository;
  teams: TeamsRepository;
  teamMemberships: TeamMembershipsRepository;
}): UsersAccessDirectoryRepairResult {
  const marker = input.db
    .prepare("SELECT value_json FROM app_settings WHERE key = ?")
    .get(USERS_ACCESS_DIRECTORY_REPAIR_KEY) as { value_json: string } | undefined;

  if (marker) {
    try {
      if (JSON.parse(marker.value_json) === "done") {
        return emptyResult(true);
      }
    } catch {
      // Re-run if unreadable.
    }
  }

  const result: UsersAccessDirectoryRepairResult = {
    alreadyApplied: false,
    reactivatedHildrethAdmin: false,
    ensuredHildrethTeamAdmin: false,
    demotedOwners: 0,
    deactivatedPlaceholders: 0,
    clearedStaleAuthCache: false,
    ambiguousUserIds: [],
    error: null,
  };

  try {
    input.db.transaction(() => {
      const repair = repairCanonicalUsers(input);
      result.reactivatedHildrethAdmin = repair.reactivatedHildrethAdmin;
      result.ensuredHildrethTeamAdmin = repair.ensuredHildrethTeamAdmin;
      result.demotedOwners = repair.demotedOwners;
      result.deactivatedPlaceholders = repair.deactivatedPlaceholders;
      result.ambiguousUserIds = repair.ambiguousUserIds;
      result.error = repair.error;

      if (result.error) {
        throw new Error(result.error);
      }

      result.clearedStaleAuthCache = clearStaleOwnerAuthCache(input.db, input.auth);
      markMigrationDone(input.db);
    });
  } catch (error) {
    result.error =
      error instanceof Error ? error.message : "Users access directory repair failed.";
    console.error(`[users-access-repair] ${result.error}`);
    if (result.ambiguousUserIds.length > 0) {
      console.error(
        `[users-access-repair] ambiguousUserIds=${result.ambiguousUserIds.join(", ")}`,
      );
    }
    return result;
  }

  if (input.auth.isAccessAllowed()) {
    const reconciliation = reconcileAuthenticatedUser(input);
    logIdentityReconciliation(reconciliation);
    if (reconciliation.ensuredTeamAdmin) {
      result.ensuredHildrethTeamAdmin = true;
    }
  }

  console.info(
    `[users-access-repair] reactivatedHildrethAdmin=${result.reactivatedHildrethAdmin} ensuredHildrethTeamAdmin=${result.ensuredHildrethTeamAdmin} demotedOwners=${result.demotedOwners} deactivatedPlaceholders=${result.deactivatedPlaceholders} clearedStaleAuthCache=${result.clearedStaleAuthCache}`,
  );

  return result;
}

function repairCanonicalUsers(input: {
  db: LocalDatabase;
  users: LocalUsersRepository;
  teams: TeamsRepository;
  teamMemberships: TeamMembershipsRepository;
}): {
  reactivatedHildrethAdmin: boolean;
  ensuredHildrethTeamAdmin: boolean;
  demotedOwners: number;
  deactivatedPlaceholders: number;
  ambiguousUserIds: string[];
  error: string | null;
} {
  const ownerEmail = normalizeEmail(DEFAULT_OWNER_EMAIL);
  const adminEmail = normalizeEmail(HILDRETH_ADMIN_EMAIL);
  const now = new Date().toISOString();

  const ownerCandidates = input.users
    .listAll()
    .filter((user) => normalizeEmail(user.email) === ownerEmail);
  if (ownerCandidates.length > 1) {
    return {
      reactivatedHildrethAdmin: false,
      ensuredHildrethTeamAdmin: false,
      demotedOwners: 0,
      deactivatedPlaceholders: 0,
      ambiguousUserIds: ownerCandidates.map((user) => user.id),
      error: `Ambiguous owner records for ${DEFAULT_OWNER_EMAIL}: ${ownerCandidates.map((user) => user.id).join(", ")}`,
    };
  }

  const hildrethCandidates = input.users
    .listAll()
    .filter((user) => normalizeEmail(user.email) === adminEmail);
  if (hildrethCandidates.length > 1) {
    return {
      reactivatedHildrethAdmin: false,
      ensuredHildrethTeamAdmin: false,
      demotedOwners: 0,
      deactivatedPlaceholders: 0,
      ambiguousUserIds: hildrethCandidates.map((user) => user.id),
      error: `Ambiguous Hildreth admin records for ${HILDRETH_ADMIN_EMAIL}: ${hildrethCandidates.map((user) => user.id).join(", ")}`,
    };
  }

  const ownerUser = ownerCandidates[0] ?? null;
  const hildrethUser = hildrethCandidates[0] ?? null;

  if (
    ownerUser &&
    hildrethUser &&
    ownerUser.supabaseUserId &&
    hildrethUser.supabaseUserId &&
    ownerUser.supabaseUserId === hildrethUser.supabaseUserId
  ) {
    return {
      reactivatedHildrethAdmin: false,
      ensuredHildrethTeamAdmin: false,
      demotedOwners: 0,
      deactivatedPlaceholders: 0,
      ambiguousUserIds: [ownerUser.id, hildrethUser.id],
      error: `Owner and Hildreth admin share the same Supabase UUID (${ownerUser.supabaseUserId}).`,
    };
  }

  let reactivatedHildrethAdmin = false;
  let ensuredHildrethTeamAdmin = false;
  let demotedOwners = 0;
  let deactivatedPlaceholders = 0;

  if (ownerUser) {
    input.users.updateIdentity({
      id: ownerUser.id,
      email: ownerEmail,
      platformRole: "owner",
      isActive: true,
    });
  }

  if (hildrethUser) {
    const wasInactive = !hildrethUser.isActive;
    input.users.updateIdentity({
      id: hildrethUser.id,
      email: adminEmail,
      platformRole: "user",
      isActive: true,
    });
    reactivatedHildrethAdmin = wasInactive || hildrethUser.platformRole === "owner";

    let team =
      input.teams
        .listAll()
        .find((entry) => entry.name === HILDRETH_MEDIA_GROUP_TEAM_NAME) ?? null;
    if (!team) {
      team = input.teams.create({
        name: HILDRETH_MEDIA_GROUP_TEAM_NAME,
        description: "Default team for Hildreth Media Group within NEUD.",
        createdByUserId: hildrethUser.id,
      });
    }
    input.teamMemberships.upsert({
      teamId: team.id,
      userId: hildrethUser.id,
      role: "admin",
      createdByUserId: ownerUser?.id ?? hildrethUser.id,
    });
    ensuredHildrethTeamAdmin = true;
  }

  for (const user of input.users.listAll()) {
    const email = normalizeEmail(user.email);

    if (email === ownerEmail) {
      continue;
    }

    if (email === adminEmail) {
      if (user.platformRole === "owner") {
        input.users.updateIdentity({
          id: user.id,
          platformRole: "user",
          isActive: true,
        });
        demotedOwners += 1;
      }
      continue;
    }

    if (user.platformRole === "owner" && user.isActive) {
      if (isHildrethAdminEmail(email) || isLegacyPlaceholderOwnerEmail(email)) {
        input.users.updateIdentity({
          id: user.id,
          platformRole: "user",
          isActive: isLegacyPlaceholderOwnerEmail(email) ? false : true,
        });
        demotedOwners += 1;
        if (isLegacyPlaceholderOwnerEmail(email)) {
          deactivatedPlaceholders += 1;
        }
        continue;
      }
    }

    if (isLegacyPlaceholderOwnerEmail(email) && user.isActive) {
      input.db
        .prepare("UPDATE local_users SET is_active = 0, platform_role = 'user', updated_at = ? WHERE id = ?")
        .run(now, user.id);
      deactivatedPlaceholders += 1;
    }
  }

  const activeOwners = input.users
    .listAll()
    .filter((user) => user.platformRole === "owner" && user.isActive);
  if (activeOwners.length > 1) {
    return {
      reactivatedHildrethAdmin,
      ensuredHildrethTeamAdmin,
      demotedOwners,
      deactivatedPlaceholders,
      ambiguousUserIds: activeOwners.map((user) => user.id),
      error: `Expected at most one active owner after repair, found ${activeOwners.length}.`,
    };
  }

  if (
    activeOwners.length === 1 &&
    normalizeEmail(activeOwners[0]!.email) !== ownerEmail
  ) {
    return {
      reactivatedHildrethAdmin,
      ensuredHildrethTeamAdmin,
      demotedOwners,
      deactivatedPlaceholders,
      ambiguousUserIds: [activeOwners[0]!.id],
      error: `Active owner email mismatch: ${activeOwners[0]!.email}`,
    };
  }

  return {
    reactivatedHildrethAdmin,
    ensuredHildrethTeamAdmin,
    demotedOwners,
    deactivatedPlaceholders,
    ambiguousUserIds: [],
    error: null,
  };
}

function clearStaleOwnerAuthCache(
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
  ).run(USERS_ACCESS_DIRECTORY_REPAIR_KEY, JSON.stringify("done"));
}

function emptyResult(alreadyApplied: boolean): UsersAccessDirectoryRepairResult {
  return {
    alreadyApplied,
    reactivatedHildrethAdmin: false,
    ensuredHildrethTeamAdmin: false,
    demotedOwners: 0,
    deactivatedPlaceholders: 0,
    clearedStaleAuthCache: false,
    ambiguousUserIds: [],
    error: null,
  };
}
