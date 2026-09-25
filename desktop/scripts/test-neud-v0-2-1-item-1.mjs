#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("online viewer publish records initiator user id for activity attribution", () => {
  const displaySync = read("desktop/src/services/display-sync/display-sync-service.ts");
  const main = read("desktop/src/main.ts");
  assert.match(displaySync, /initiatorUserId/);
  assert.match(displaySync, /code\.updatedBy/);
  assert.match(main, /resolveActivityActorForUserId\(input\.initiatorUserId\)/);
});

test("display.online_published is not treated as automated System activity", () => {
  const actorResolution = read("desktop/src/lib/activity/actor-resolution.ts");
  assert.doesNotMatch(actorResolution, /"display\.online_published"/);
  assert.match(actorResolution, /"display\.online_publish_failed"/);
});

test("team member counts join active users and prune orphan memberships", () => {
  const teamsRepo = read("desktop/src/repositories/teams-repository.ts");
  const membershipsRepo = read("desktop/src/repositories/team-memberships-repository.ts");
  const accessService = read("desktop/src/services/access-management-service.ts");
  assert.match(teamsRepo, /INNER JOIN users u ON u\.id = tm\.user_id/);
  assert.match(membershipsRepo, /pruneOrphans/);
  assert.match(accessService, /pruneOrphans\(\)/);
});

test("migration 054 counts team members with existing profiles only", () => {
  const migration = read("supabase/migrations/054_v0_2_1_team_member_count_and_owner_project_access.sql");
  assert.match(migration, /count_team_active_members/);
  assert.match(migration, /inner join public\.profiles p on p\.id = tm\.user_id/);
});

test("protected NEUD owner cannot be removed from project access", () => {
  const protect = read("shared/access-management/protect-project-owner.ts");
  const accessService = read("desktop/src/services/access-management-service.ts");
  const roleModel = read("src/lib/access-management/role-model.ts");
  const migration = read("supabase/migrations/054_v0_2_1_team_member_count_and_owner_project_access.sql");
  assert.match(protect, /isProtectedNeudOwnerUser/);
  assert.match(accessService, /PROJECT_OWNER_REMOVAL_MESSAGE/);
  assert.match(roleModel, /isSoleOwnerProfile\(user\)/);
  assert.match(migration, /is_sole_owner_user\(p_user_id\)/);
  assert.match(migration, /owner_protected/);
});
