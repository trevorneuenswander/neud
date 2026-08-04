import type { LocalUsersRepository } from "../repositories/local-users-repository";
import type { TeamsRepository } from "../repositories/teams-repository";
import type { TeamMembershipsRepository } from "../repositories/team-memberships-repository";
import {
  DEFAULT_OWNER_EMAIL,
  HILDRETH_ADMIN_EMAIL,
  isHildrethAdminEmail,
  isLegacyPlaceholderOwnerEmail,
} from "../auth/default-owner-email";
import { normalizeEmail } from "../auth/normalize-email";
import { HILDRETH_MEDIA_GROUP_TEAM_NAME } from "./user-identity-reconciliation-service";

export type CanonicalUserRepairResult = {
  reactivatedHildrethAdmin: boolean;
  ensuredHildrethTeamAdmin: boolean;
  demotedOwners: number;
  deactivatedPlaceholders: number;
  ambiguousUserIds: string[];
  error: string | null;
};

export function repairCanonicalAccounts(input: {
  users: LocalUsersRepository;
  teams: TeamsRepository;
  teamMemberships: TeamMembershipsRepository;
}): CanonicalUserRepairResult {
  const ownerEmail = normalizeEmail(DEFAULT_OWNER_EMAIL);
  const adminEmail = normalizeEmail(HILDRETH_ADMIN_EMAIL);

  const ownerCandidates = input.users
    .listAll()
    .filter((user) => normalizeEmail(user.email) === ownerEmail);
  if (ownerCandidates.length > 1) {
    return fail(
      ownerCandidates.map((user) => user.id),
      `Ambiguous owner records for ${DEFAULT_OWNER_EMAIL}.`,
    );
  }

  const hildrethCandidates = input.users
    .listAll()
    .filter((user) => normalizeEmail(user.email) === adminEmail);
  if (hildrethCandidates.length > 1) {
    return fail(
      hildrethCandidates.map((user) => user.id),
      `Ambiguous Hildreth admin records for ${HILDRETH_ADMIN_EMAIL}.`,
    );
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
    return fail(
      [ownerUser.id, hildrethUser.id],
      `Owner and Hildreth admin share the same Supabase UUID (${ownerUser.supabaseUserId}).`,
    );
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
      supabaseAccountAvailable: true,
    });
  }

  if (hildrethUser) {
    const wasInactive = !hildrethUser.isActive;
    input.users.updateIdentity({
      id: hildrethUser.id,
      email: adminEmail,
      platformRole: "user",
      isActive: true,
      supabaseAccountAvailable: true,
    });
    reactivatedHildrethAdmin =
      wasInactive || hildrethUser.platformRole === "owner";

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

    if (email === ownerEmail || email === adminEmail) {
      if (email === adminEmail && user.platformRole === "owner") {
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
      }
    } else if (isLegacyPlaceholderOwnerEmail(email) && user.isActive) {
      input.users.updateIdentity({
        id: user.id,
        platformRole: "user",
        isActive: false,
      });
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
      error: `Expected at most one active owner, found ${activeOwners.length}.`,
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

function fail(ambiguousUserIds: string[], error: string): CanonicalUserRepairResult {
  return {
    reactivatedHildrethAdmin: false,
    ensuredHildrethTeamAdmin: false,
    demotedOwners: 0,
    deactivatedPlaceholders: 0,
    ambiguousUserIds,
    error,
  };
}
