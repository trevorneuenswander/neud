import { sanitizeError } from "./sanitize.mjs";
import {
  deleteValidationProjectViaPostgres,
  projectRowExists,
} from "./validation-project-delete.mjs";
import { unregisterValidationFixtures } from "./validation-fixture-registry.mjs";

export function createAccessTestFixtureTracker(testRunId = `${Date.now()}`) {
  return {
    testRunId,
    invitationIds: [],
    projectIds: [],
    teamIds: [],
    userIds: [],
  };
}

export function trackAccessFixture(tracker, type, id) {
  if (!id || !tracker?.[type]) {
    return;
  }
  if (!tracker[type].includes(id)) {
    tracker[type].push(id);
  }
}

export async function deleteValidationProjectGraph(dbClient, projectId) {
  const result = await deleteValidationProjectViaPostgres(dbClient, projectId);
  if (!result.ok) {
    throw new Error(
      result.stillExists
        ? "Project row still exists after validation cleanup delete."
        : "Validation project delete did not remove the project row.",
    );
  }
  return result;
}

export async function cleanupAccessTestFixtures(dbClient, admin, tracker, options = {}) {
  if (options.preserveFixtures) {
    return {
      skipped: true,
      reason: "preserve_fixtures",
      counts: {},
    };
  }

  const counts = {
    invitations: 0,
    projectTeamAssignments: 0,
    projectMembers: 0,
    teamMemberships: 0,
    teams: 0,
    users: 0,
    projects: 0,
  };
  const errors = [];

  for (const invitationId of tracker.invitationIds) {
    const { error } = await admin.from("cloud_invitations").delete().eq("id", invitationId);
    if (error) {
      errors.push(`invitation:${invitationId}:${error.message}`);
    } else {
      counts.invitations += 1;
    }
  }

  const deletedProjectIds = [];
  for (const projectId of tracker.projectIds) {
    try {
      await deleteValidationProjectGraph(dbClient, projectId);
      counts.projects += 1;
      deletedProjectIds.push(projectId);
    } catch (error) {
      errors.push(`project:${projectId}:${sanitizeError(error).message}`);
    }
  }
  unregisterValidationFixtures(deletedProjectIds);

  for (const teamId of tracker.teamIds) {
    await admin.from("project_team_assignments").delete().eq("team_id", teamId);
    const { error: membershipError } = await admin
      .from("team_memberships")
      .delete()
      .eq("team_id", teamId);
    if (membershipError) {
      errors.push(`teamMemberships:${teamId}:${membershipError.message}`);
    } else {
      counts.teamMemberships += 1;
    }
    const { error: teamError } = await admin.from("teams").delete().eq("id", teamId);
    if (teamError) {
      errors.push(`team:${teamId}:${teamError.message}`);
    } else {
      counts.teams += 1;
    }
  }
  unregisterValidationFixtures(tracker.teamIds);

  for (const userId of tracker.userIds) {
    await admin.from("team_memberships").delete().eq("user_id", userId);
    await admin.from("project_members").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      errors.push(`user:${userId}:${error.message}`);
    } else {
      counts.users += 1;
    }
  }
  unregisterValidationFixtures(tracker.userIds);
  unregisterValidationFixtures(tracker.invitationIds);

  return {
    skipped: false,
    counts,
    errors,
    ok: errors.length === 0,
  };
}

export function parsePreserveFixturesFlag(argv = process.argv) {
  return argv.includes("--preserve-fixtures");
}

export { projectRowExists };
