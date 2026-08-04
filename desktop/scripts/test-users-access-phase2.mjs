import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function activityDescriptionWithoutActor(message, actorName) {
  const trimmedMessage = message.trim();
  const trimmedActor = actorName.trim();

  if (!trimmedMessage) {
    return trimmedMessage;
  }

  if (!trimmedActor) {
    return trimmedMessage;
  }

  const escapedActor = escapeRegExp(trimmedActor);
  const withoutActor = trimmedMessage
    .replace(new RegExp(`^${escapedActor}\\s*[—–-]?\\s*`, "i"), "")
    .trim();

  return withoutActor || trimmedMessage;
}

test("activity description removes actor prefix from full-page descriptions", () => {
  assert.equal(
    activityDescriptionWithoutActor(
      "Trevor Neuenswander published scraper code",
      "Trevor Neuenswander",
    ),
    "published scraper code",
  );
  assert.equal(
    activityDescriptionWithoutActor(
      "Trevor Neuenswander — published scraper code",
      "Trevor Neuenswander",
    ),
    "published scraper code",
  );
  assert.equal(
    activityDescriptionWithoutActor(
      "System — restarted the scraper engine",
      "System",
    ),
    "restarted the scraper engine",
  );
});

test("activity description preserves middle names and unrelated prefixes", () => {
  assert.equal(
    activityDescriptionWithoutActor(
      "Published scraper code for Trevor Neuenswander",
      "Trevor Neuenswander",
    ),
    "Published scraper code for Trevor Neuenswander",
  );
  assert.equal(
    activityDescriptionWithoutActor(
      "Trevor published scraper code",
      "Trevor Neuenswander",
    ),
    "Trevor published scraper code",
  );
});

test("migration 015 defines project team assignments", () => {
  const sql = read("desktop/src/database/migrations/015_project_team_assignments.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_team_assignments/);
  assert.match(sql, /UNIQUE \(project_id, team_id\)/);
});

test("multi-team migration copies legacy team assignments", () => {
  const source = read("desktop/src/services/multi-team-data-migration.ts");
  assert.match(source, /copyLegacyProjectTeams/);
  assert.match(source, /rebuildTeamScopedProjectMemberships/);
  assert.match(source, /MULTI_TEAM_MIGRATION_KEY/);
});

test("authorization service supports many-to-many project teams", () => {
  const source = read("desktop/src/services/access-authorization-service.ts");
  assert.match(source, /getProjectTeams/);
  assert.match(source, /getVisibleProjectTeams/);
  assert.match(source, /isProjectAssignedToTeam/);
  assert.match(source, /assertCanManageProjectForTeam/);
  assert.match(source, /ProjectTeamAssignmentsRepository/);
});

test("access management supports team editing and multi-team assignment", () => {
  const source = read("desktop/src/services/access-management-service.ts");
  assert.match(source, /access\.team-updated/);
  assert.match(source, /setProjectTeams/);
  assert.match(source, /access\.project-team-assigned/);
  assert.match(source, /access\.project-team-removed/);
  assert.match(source, /teamIds/);
  assert.match(source, /removeAllForProjectTeam/);
});

test("project memberships require team scope", () => {
  const source = read("desktop/src/repositories/project-memberships-repository.ts");
  assert.match(source, /team_id/);
  assert.match(source, /get\(projectId: string, teamId: string, userId: string\)/);
});

test("activity full view uses displayDescription for table and csv", () => {
  const table = read("src/components/activity/ActivityTable.tsx");
  const fullView = read("src/components/activity/ActivityFullView.tsx");
  assert.match(table, /displayDescription/);
  assert.match(fullView, /withActivityDisplayDescription/);
  assert.match(fullView, /description: event\.displayDescription/);
});

test("users and access client supports search and multi-team projects", () => {
  const source = read("src/components/users/LocalUsersAccessClient.tsx");
  assert.match(source, /Search teams/);
  assert.match(source, /Search users/);
  assert.match(source, /localSetProjectTeams/);
  assert.match(source, /Edit/);
  assert.match(source, /searchParams/);
});

test("projects list shows associated teams", () => {
  const source = read("src/components/projects/ProjectList.tsx");
  assert.match(source, /project\.teams/);
  assert.match(source, /Unassigned/);
});

test("main wires multi-team migration and project team repository", () => {
  const source = read("desktop/src/main.ts");
  assert.match(source, /runMultiTeamDataMigration/);
  assert.match(source, /ProjectTeamAssignmentsRepository/);
});
