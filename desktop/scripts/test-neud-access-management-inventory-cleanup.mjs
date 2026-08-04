#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  classifyInvitation,
  classifyProject,
  classifyTeam,
  classifyUser,
  isExampleTestEmail,
  isMatrixTeamName,
} from "../../scripts/live-validation/lib/access-management-classification.mjs";
import {
  isProtectedProject,
  isProtectedTeam,
  isProtectedUser,
} from "../../scripts/live-validation/lib/access-management-protected-records.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("inventory diagnostic script is registered", () => {
  const pkg = read("package.json");
  assert.match(pkg, /diagnose:access-management-inventory/);
  assert.match(pkg, /cleanup:access-management-test-fixtures/);
});

test("Matrix Team names classify as automated test fixtures", () => {
  assert.equal(
    classifyTeam({ name: "Matrix Team 1785735376674", is_active: true }),
    "automated_test_fixture",
  );
});

test("protected teams are never classified as fixtures", () => {
  assert.equal(classifyTeam({ name: "NEUD", is_active: true }), "intended_real");
  assert.equal(classifyTeam({ name: "Hildreth Media Group", is_active: true }), "intended_real");
  assert.ok(isProtectedTeam({ name: "NEUD" }));
});

test("example.com test users classify as automated fixtures", () => {
  assert.equal(
    classifyUser(
      { email: "access-outsider-1785735376674@example.com", role: "user" },
      { teamMembershipCount: 0, projectMembershipCount: 0 },
    ),
    "automated_test_fixture",
  );
  assert.equal(
    classifyUser(
      { email: "live-admin-ms5jslmf@example.com", role: "admin" },
      { teamMembershipCount: 0, projectMembershipCount: 0 },
    ),
    "automated_test_fixture",
  );
});

test("Trevor Neuenswander profiles are protected", () => {
  assert.ok(isProtectedUser({ full_name: "Trevor Neuenswander", email: "trevor@example.org" }));
});

test("Broad Arrow project is protected", () => {
  assert.ok(isProtectedProject({ slug: "broad-arrow-auctions", name: "Broad Arrow Auctions" }));
});

test("validation project slugs classify as automated fixtures", () => {
  assert.equal(
    classifyProject({ slug: "neud-validation-live-a-abc", name: "Validation", is_active: true }),
    "automated_test_fixture",
  );
});

test("archived projects classify as legacy deleted", () => {
  assert.equal(
    classifyProject({ slug: "old-project", name: "Old", is_active: false, archived_at: "2026-01-01" }),
    "legacy_deleted_project",
  );
});

test("invitee example.com invitations classify as fixtures", () => {
  assert.equal(
    classifyInvitation({ email_normalized: "invitee-123@example.com", status: "revoked" }),
    "automated_test_fixture",
  );
});

test("access photo matrix tracks fixtures and cleans up in finally", () => {
  const script = read("scripts/live-validation/run-access-photo-matrix.mjs");
  assert.match(script, /createAccessTestFixtureTracker/);
  assert.match(script, /cleanupAccessTestFixtures/);
  assert.match(script, /finally/);
  assert.match(script, /parsePreserveFixturesFlag/);
});

test("live matrix cleans up auth test users in finally", () => {
  const script = read("scripts/live-validation/run-live-matrix.mjs");
  assert.match(script, /trackAccessFixture\(fixtureTracker, "userIds"/);
  assert.match(script, /cleanupAccessTestFixtures/);
});

test("cleanup tool defaults to dry run and requires confirm flag", () => {
  const script = read("scripts/live-validation/cleanup-access-management-test-fixtures.mjs");
  assert.match(script, /mode: confirm \? "confirm" : "dry_run"/);
  assert.match(script, /parseConfirmFlag/);
  assert.doesNotMatch(script, /process\.argv\.includes\("--confirm"\)[\s\S]*delete/);
});

test("043 migration filters users and archived projects", () => {
  const migration = read("supabase/migrations/043_filter_access_management_directory.sql");
  assert.match(migration, /043_filter_access_management_directory\.sql/);
  assert.match(migration, /pr\.archived_at is null/);
  assert.match(migration, /team_memberships tm/);
  assert.match(migration, /p\.role in \('owner', 'admin'\)/);
});

test("044 migration excludes validation fixtures unless includeFixtures is requested", () => {
  const migration = read("supabase/migrations/044_exclude_validation_fixtures_from_directory.sql");
  assert.match(migration, /p_include_fixtures boolean default false/);
  assert.match(migration, /is_validation_fixture_project/);
  assert.match(migration, /is_validation_fixture_email/);
  assert.match(migration, /grant execute on function public\.get_access_management_directory\(boolean\) to authenticated/);
});

test("validation project cleanup uses postgres trigger bypass and post-delete verification", () => {
  const script = read("scripts/live-validation/cleanup-validation-projects.mjs");
  const deleteModule = read("scripts/live-validation/lib/validation-project-delete.mjs");
  assert.match(script, /deleteValidationProjectWithAudit/);
  assert.match(script, /createLiveValidationDbClient/);
  assert.match(deleteModule, /session_replication_role = replica/);
  assert.match(script, /postDeleteVerification/);
  assert.match(script, /validation-project-cleanup-audit\.json/);
});

test("validation fixture registry tracks fixture metadata", () => {
  const registry = read("scripts/live-validation/lib/validation-fixture-registry.mjs");
  assert.match(registry, /fixture_id/);
  assert.match(registry, /fixture_type/);
  assert.match(registry, /registerValidationFixture/);
});

test("validation project names with NEUD Validation prefix classify as fixtures", () => {
  assert.equal(
    classifyProject({
      slug: "custom-slug-only",
      name: "[NEUD Validation] Live Project A",
      is_active: true,
    }),
    "automated_test_fixture",
  );
});

test("shared access tables use AccessManagementTable with fixed columns", () => {
  for (const file of [
    "src/components/access-management/TeamsPanel.tsx",
    "src/components/access-management/UsersPanel.tsx",
    "src/components/access-management/ProjectAccessPanel.tsx",
    "src/components/access-management/InvitationsPanel.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /AccessManagementTable/, `${file} must use AccessManagementTable`);
    assert.doesNotMatch(source, /DataTableHead[\s\S]*DataTableRow/, `${file} must not nest header rows`);
  }
});

test("invitations panel defaults to pending status filter", () => {
  const panel = read("src/components/access-management/InvitationsPanel.tsx");
  assert.match(panel, /useState<InvitationStatusFilter>\("pending"\)/);
  assert.match(panel, /Pending/);
  assert.match(panel, /All/);
});

test("users without memberships classify as orphaned when example.com", () => {
  assert.equal(
    classifyUser(
      { email: "someone@example.com", role: "user" },
      { teamMembershipCount: 0, projectMembershipCount: 0 },
    ),
    "orphaned_membership",
  );
});

test("cleanup helper deletes projects via postgres trigger bypass", () => {
  const helper = read("scripts/live-validation/lib/access-management-test-cleanup.mjs");
  const deleteModule = read("scripts/live-validation/lib/validation-project-delete.mjs");
  assert.match(helper, /deleteValidationProjectViaPostgres/);
  assert.match(deleteModule, /session_replication_role = replica/);
  const invitationIndex = helper.indexOf("cloud_invitations");
  const teamIndex = helper.indexOf('from("teams").delete');
  const userIndex = helper.indexOf("auth.admin.deleteUser");
  assert.ok(invitationIndex < teamIndex);
  assert.ok(teamIndex < userIndex);
});

test("matrix team detector matches live fixture naming", () => {
  assert.ok(isMatrixTeamName("Matrix Team 1785735404052"));
  assert.ok(isExampleTestEmail("access-owner-1785735376674@example.com"));
});
