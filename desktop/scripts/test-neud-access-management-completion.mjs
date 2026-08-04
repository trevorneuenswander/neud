#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const MUTATION_CLIENT_OPS = [
  "createTeam",
  "updateTeam",
  "archiveTeam",
  "addTeamMember",
  "changeTeamMemberRole",
  "removeTeamMember",
  "assignProjectTeam",
  "removeProjectTeam",
  "addProjectMember",
  "changeProjectMemberRole",
  "removeProjectMember",
];

test("mutations-client exposes all required team and project operations", () => {
  const source = read("src/lib/access-management/mutations-client.ts");
  for (const op of MUTATION_CLIENT_OPS) {
    assert.match(source, new RegExp(`export async function ${op}`));
  }
});

test("invitation-client exposes create resend revoke accept operations", () => {
  const source = read("src/lib/access-management/invitation-client.ts");
  for (const op of ["createInvitation", "resendInvitation", "revokeInvitation", "acceptInvitation"]) {
    assert.match(source, new RegExp(`export async function ${op}`));
  }
});

test("trusted invitation routes exist for full lifecycle", () => {
  assert.ok(fs.existsSync(path.join(root, "src/app/api/access/invitations/route.ts")));
  assert.ok(
    fs.existsSync(
      path.join(root, "src/app/api/access/invitations/[invitationId]/resend/route.ts"),
    ),
  );
  assert.ok(
    fs.existsSync(
      path.join(root, "src/app/api/access/invitations/[invitationId]/revoke/route.ts"),
    ),
  );
  assert.ok(fs.existsSync(path.join(root, "src/app/api/access/invitations/accept/route.ts")));
});

test("041 migration adds resend and completes accept assignments", () => {
  const migration = read("supabase/migrations/041_access_invitation_completion.sql");
  assert.match(migration, /resend_cloud_invitation/);
  assert.match(migration, /team_memberships/);
  assert.match(migration, /teamMemberships/);
  assert.match(migration, /v_user_email <> v_invitation.email_normalized/);
});

test("desktop cloud access API exposes mutation parity routes", () => {
  const api = read("src/lib/local/cloud-access-api.ts");
  const server = read("desktop/src/services/local-api-server.ts");
  for (const route of [
    "/api/access/cloud/team-members",
    "/api/access/cloud/project-members",
    "/api/access/cloud/project-teams",
    "/api/access/cloud/invitations",
  ]) {
    assert.match(api, new RegExp(route.replace(/\//g, "\\/")));
    assert.match(server, new RegExp(route.replace(/\//g, "\\/")));
  }
});

test("desktop sqlite cache migration and repository exist", () => {
  const migration = read("desktop/src/database/migrations/035_cloud_access_cache.sql");
  const repository = read("desktop/src/repositories/cloud-access-cache-repository.ts");
  assert.match(migration, /cloud_access_cache/);
  assert.match(read("desktop/src/database/migrate.ts"), /035_cloud_access_cache\.sql/);
  assert.match(repository, /replaceDirectory/);
  assert.match(repository, /transaction/);
});

test("shared access panels wire mutation action props", () => {
  const tabs = read("src/components/access-management/AccessManagementTabs.tsx");
  assert.match(tabs, /actions\?: AccessManagementActions/);
  assert.match(read("src/components/access-management/TeamsPanel.tsx"), /actions\?\./);
  assert.match(read("src/components/access-management/ProjectAccessPanel.tsx"), /actions\?\./);
  assert.match(read("src/components/access-management/InvitationsPanel.tsx"), /actions\?\./);
});

test("portal and desktop clients use shared action factories", () => {
  assert.match(
    read("src/components/access-management/CloudAccessManagementClient.tsx"),
    /createPortalAccessActions/,
  );
  assert.match(
    read("src/components/access-management/DesktopCloudAccessManagementClient.tsx"),
    /createDesktopAccessActions/,
  );
});

test("invitation create route returns invitationId without token material", () => {
  const createRoute = read("src/app/api/access/invitations/route.ts");
  assert.match(createRoute, /verifyAuthenticatedAccessRequest/);
  assert.match(createRoute, /invitationId:/);
  const successResponse = createRoute.slice(createRoute.lastIndexOf("return Response.json({"));
  assert.doesNotMatch(successResponse, /token_hash|rawToken|invitation_token/);
});

test("activity allowlist includes access-management event types", () => {
  const migration = read("supabase/migrations/037_access_activity_events.sql");
  for (const event of [
    "team.created",
    "invitation.created",
    "invitation.resent",
    "invitation.revoked",
    "invitation.accepted",
    "project.team_assigned",
    "project.team_removed",
  ]) {
    assert.match(migration, new RegExp(`'${event}'`));
  }
});

test("legacy access writes are blocked when cloud session is authoritative", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /isCloudAccessManagementAuthoritative/);
  assert.match(server, /rejectLegacyAccessWrite/);
  assert.match(server, /cloud_access_required/);
});

test("lot photo removal marks orphan candidate through cloud photo service", () => {
  const routes = read("desktop/src/bag/live-state/bag-live-state-routes.ts");
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(routes, /onLotPhotoRemoved/);
  assert.match(service, /markLotPhotoOrphanCandidate/);
});

test("users panel summarizes team and project access from cloud directory", () => {
  const panel = read("src/components/access-management/UsersPanel.tsx");
  assert.match(panel, /teamMemberships/);
  assert.match(panel, /projectMembers/);
  assert.match(panel, /Project Access/);
  assert.match(panel, /summarizeTeamRolesForUser/);
});
