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

test("NEUD team is recognized as protected by canonical helper", () => {
  const helper = read("shared/access-management/is-protected-neud-team.ts");
  assert.match(helper, /NEUD_TEAM_IDENTIFIERS/);
  assert.match(helper, /isProtectedNeudTeam/);
  assert.match(helper, /slug/);
});

test("team delete prevalidation blocks NEUD team first", () => {
  const canDelete = read("shared/access-management/can-delete-team.ts");
  assert.match(canDelete, /isProtectedNeudTeamId/);
  assert.match(canDelete, /neud_team_protected/);
  assert.match(
    canDelete,
    /validateTeamDeletionTargets[\s\S]*isProtectedNeudTeamId[\s\S]*neud_team_protected[\s\S]*permission_denied/,
  );
});

test("owner and team admin routes cannot delete NEUD team", () => {
  const deleteHelper = read("src/lib/access-management/delete-platform-team.ts");
  const route = read("src/app/api/access/teams/[teamId]/delete/route.ts");
  const service = read("desktop/src/services/access-management-service.ts");
  assert.match(deleteHelper, /isProtectedNeudTeam\(team\)/);
  assert.match(deleteHelper, /neud_team_protected/);
  assert.match(route, /neud_team_protected/);
  assert.match(service, /isProtectedNeudTeam/);
  assert.doesNotMatch(deleteHelper, /from\("teams"\)\.delete[\s\S]*isProtectedNeudTeam/s);
});

test("delete UI hides NEUD team delete action", () => {
  const deleteBtn = read("src/components/access-management/AccessTeamDeleteButton.tsx");
  assert.match(deleteBtn, /isProtectedNeudTeamId/);
});

test("normal team delete path remains for non-NEUD teams", () => {
  const canDelete = read("shared/access-management/can-delete-team.ts");
  assert.match(canDelete, /validateTeamDeletionTargets/);
  assert.match(canDelete, /canDeleteUserInDirectory/);
});
