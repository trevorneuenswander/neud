/**
 * NEUD Alpha v0.3.1 — Team Admin Users and Access + hosted display visibility gates.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("desktop Users page uses capability gate instead of requireAdmin", () => {
  const page = read("src/app/(portal)/users/page.tsx");
  assert.match(page, /canManageUsersAndAccess/);
  assert.match(page, /Capability-based/);
  const localBlock = page.slice(page.indexOf("if (localMode)"), page.indexOf("const { profile }"));
  assert.doesNotMatch(localBlock, /requireAdmin\(\)/);
  assert.match(localBlock, /requireUser\(\)/);
});

test("hosted Users page allows Team Admins via managedTeamIds", () => {
  const page = read("src/app/portal/users/page.tsx");
  assert.match(page, /resolveAccessCapabilities/);
  assert.match(page, /managedTeamIds/);
  assert.doesNotMatch(page, /requireAdmin\(\)/);
});

test("hosted proxy remaps /users before desktop-only dashboard redirect", () => {
  const proxy = read("src/lib/supabase/proxy.ts");
  const legacyIdx = proxy.indexOf("isHostedLegacyPortalPath");
  const desktopIdx = proxy.indexOf("isHostedDesktopOnlyPath", legacyIdx);
  assert.ok(legacyIdx > 0 && desktopIdx > legacyIdx);
});

test("AccessManagementService allows Team Admin role assignment with last-admin protection", () => {
  const service = read("desktop/src/services/access-management-service.ts");
  assert.doesNotMatch(
    service,
    /Only the Owner may assign the Admin role/,
  );
  assert.match(service, /must keep at least one Admin/);
  assert.match(service, /countAdmins\(input\.teamId\) <= 1/);
  assert.match(service, /countAdmins\(teamId\) <= 1/);
});

test("team identity equivalence rejects same-name local team cross-grant", () => {
  const auth = read("desktop/src/services/access-authorization-service.ts");
  assert.match(auth, /teamIdsReferToSameLogicalTeam/);
  assert.match(auth, /Never equate two different local team rows by name alone/);
  assert.doesNotMatch(auth, /expandTeamIdAliases/);
  const sync = read("desktop/src/services/cloud-access-local-sync.ts");
  assert.match(sync, /Ambiguous same-name local teams/);
  assert.match(sync, /matches\.length === 1/);
});

test("hosted display list surfaces RPC errors instead of silent empty", () => {
  const queries = read("src/lib/hosted/portal-queries.ts");
  assert.match(queries, /displayListError/);
  assert.match(queries, /listError/);
  const page = read("src/app/portal/projects/[slug]/displays/page.tsx");
  assert.match(page, /displayListError/);
  assert.match(page, /Unable to load displays/);
});

test("runtime: same-name local teams do not share cloud assignment aliases", async () => {
  const syncUrl = pathToFileURL(
    path.join(root, "desktop/src/services/cloud-access-local-sync.ts"),
  ).href;
  const { resolveLocalTeamIdForCloudAssignment } = await import(syncUrl);

  const teamA = { id: "local-a", name: "Acme Media" };
  const teamB = { id: "local-b", name: "Acme Media" };
  const teams = {
    getById(id) {
      return [teamA, teamB].find((team) => team.id === id) ?? null;
    },
    listAll() {
      return [teamA, teamB];
    },
  };

  const ambiguous = resolveLocalTeamIdForCloudAssignment({
    cloudTeamId: "cloud-acme",
    teams,
    cloudTeams: [{ id: "cloud-acme", name: "Acme Media", slug: "acme-media" }],
  });
  assert.equal(ambiguous.aliased, false);
  assert.equal(ambiguous.teamId, "cloud-acme");

  const uniqueTeams = {
    getById(id) {
      return id === teamA.id ? teamA : null;
    },
    listAll() {
      return [teamA];
    },
  };
  const unique = resolveLocalTeamIdForCloudAssignment({
    cloudTeamId: "cloud-acme",
    teams: uniqueTeams,
    cloudTeams: [{ id: "cloud-acme", name: "Acme Media", slug: "acme-media" }],
  });
  assert.equal(unique.aliased, true);
  assert.equal(unique.teamId, "local-a");
});
