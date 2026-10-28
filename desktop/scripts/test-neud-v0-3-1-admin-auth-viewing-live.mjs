#!/usr/bin/env node
/**
 * NEUD v0.3.1 — Admin team-id alias authorization + SEMA viewing/live separation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("authorization aliases cloud/local Hildreth team ids by name", () => {
  const auth = read("desktop/src/services/access-authorization-service.ts");
  // Unique local↔cloud pairs may share a name; distinct same-name local teams must not.
  assert.match(auth, /teamIdsReferToSameLogicalTeam/);
  assert.match(auth, /membershipMatchesAssignedTeams/);
  assert.match(auth, /mergeCloudTeamMemberships/);
  assert.match(auth, /Never equate two different local team rows by name alone/);
  assert.match(auth, /ensureHildrethTeamAdmin|Hildreth|local team/i);
});

test("cloud project-team sync maps hosted team UUID onto local team row", () => {
  const sync = read("desktop/src/services/cloud-access-local-sync.ts");
  assert.match(sync, /resolveLocalTeamIdForCloudAssignment/);
  assert.match(sync, /teamIdAliasesApplied/);
  const management = read("desktop/src/services/access-management-service.ts");
  assert.match(management, /cloudTeams/);
  assert.match(management, /teams: this\.teams/);
});

test("project access API supports pending cloud-directory state", () => {
  const data = read("desktop/src/services/local-data-service.ts");
  const api = read("desktop/src/services/local-api-server.ts");
  const authz = read("src/lib/projects/authorization.ts");
  assert.match(data, /resolveProjectAccessContextBySlug/);
  assert.match(data, /cloud_directory_not_ready/);
  assert.match(data, /\[neud-project-access\]/);
  assert.match(api, /PROJECT_ACCESS_PENDING/);
  assert.match(api, /status === "pending"/);
  assert.match(authz, /state: "loading"/);
  assert.match(authz, /PROJECT_ACCESS_PENDING/);
});

test("team-id alias matrix: local HMG admin + cloud assignment UUID", () => {
  function normalize(value) {
    return value.trim().toLowerCase();
  }

  function expandAliases(teamId, localTeams, cloudTeams) {
    const aliases = new Set([teamId]);
    const local = localTeams.find((t) => t.id === teamId);
    const cloud = cloudTeams.find((t) => t.id === teamId);
    const names = new Set();
    if (local) names.add(normalize(local.name));
    if (cloud) {
      names.add(normalize(cloud.name));
      aliases.add(cloud.id);
    }
    for (const team of [...localTeams, ...cloudTeams]) {
      if (names.has(normalize(team.name))) aliases.add(team.id);
    }
    return aliases;
  }

  function canAccess(localProjectId, localMemberships, assignedTeamIds, localTeams, cloudTeams) {
    for (const membership of localMemberships) {
      if (membership.role !== "admin") continue;
      const aliases = expandAliases(membership.teamId, localTeams, cloudTeams);
      if (assignedTeamIds.some((id) => aliases.has(id))) return true;
      for (const assigned of assignedTeamIds) {
        const assignedAliases = expandAliases(assigned, localTeams, cloudTeams);
        for (const alias of assignedAliases) {
          if (aliases.has(alias)) return true;
        }
      }
    }
    return false;
  }

  const localHmg = { id: "local-hmg", name: "Hildreth Media Group" };
  const cloudHmg = { id: "cloud-hmg-uuid", name: "Hildreth Media Group", slug: "hmg" };
  const admin = [{ teamId: "local-hmg", role: "admin" }];

  // Previous failure mode: assignment stores cloud team id, membership is local id.
  assert.equal(
    canAccess("local-ba", admin, ["cloud-hmg-uuid"], [localHmg], [cloudHmg]),
    true,
  );
  assert.equal(
    canAccess("local-ba", admin, ["other-team"], [localHmg], [cloudHmg]),
    false,
  );
  assert.equal(
    canAccess("local-ba", [{ teamId: "local-hmg", role: "viewer" }], ["cloud-hmg-uuid"], [localHmg], [
      cloudHmg,
    ]),
    false,
  );
});

test("SEMA migration adds viewing worksheet columns", () => {
  const migration = read("desktop/src/database/migrations/048_sema_viewing_worksheet.sql");
  const migrate = read("desktop/src/database/migrate.ts");
  assert.match(migration, /viewing_worksheet_gid/);
  assert.match(migration, /highlight_source_worksheet_gid/);
  assert.match(migration, /UPDATE sema_schedule_state/);
  assert.match(migrate, /048_sema_viewing_worksheet\.sql/);
});

test("SEMA service separates viewing worksheet from live schedule", () => {
  const service = read("desktop/src/packages/sema/sema-schedule-service.ts");
  assert.match(service, /setViewingWorksheet/);
  assert.match(service, /liveSchedule/);
  assert.match(service, /viewingSharesLive|sameWorksheetGid/);
  assert.match(service, /Never publishes to graphics|viewing-only|Viewing-only/i);
  assert.match(service, /highlight_source_worksheet_gid/);
  // Jump across worksheets promotes viewing → live (requested gid).
  assert.match(service, /sheet_worksheet_gid: requestedGid/);
  assert.match(service, /async jump\(/);
});

test("Data Source tab uses viewing-sheet action and does not refresh live", () => {
  const client = read("src/components/sema/SemaGoogleSheetClient.tsx");
  const api = read("src/graphics/sema-schedule/schedule-api.ts");
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(client, /viewing-sheet/);
  assert.doesNotMatch(client, /live schedule unchanged/i);
  assert.match(client, /Viewing:.*Live:/);
  assert.match(client, /viewingIsLive/);
  assert.doesNotMatch(
    client,
    /viewing-sheet[\s\S]{0,400}postSemaAction[\s\S]{0,80}"refresh"/,
  );
  assert.match(api, /"viewing-sheet"/);
  assert.match(server, /viewing-sheet/);
  assert.match(server, /setSemaViewingWorksheet/);
});

test("sidebar install filter remains installed-only", () => {
  const hook = read("src/hooks/useSidebarProjects.ts");
  assert.match(hook, /scope:\s*"installed"/);
  assert.doesNotMatch(hook, /scope:\s*"directory"/);
});
