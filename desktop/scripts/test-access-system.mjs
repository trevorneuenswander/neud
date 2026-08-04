import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("migration 014 defines teams and membership tables", () => {
  const sql = read("desktop/src/database/migrations/014_teams_and_access.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS teams/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS team_memberships/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_memberships/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS local_users/);
  assert.match(sql, /ALTER TABLE projects ADD COLUMN team_id/);
});

test("access authorization service exposes capability checks", () => {
  const source = read("desktop/src/services/access-authorization-service.ts");
  assert.match(source, /getProjectCapabilities/);
  assert.match(source, /assertCanManageTeam/);
  assert.match(source, /assertCanEditProjectSettings/);
  assert.match(source, /assertCanOperateEngine/);
});

test("access management service records team and user activity", () => {
  const source = read("desktop/src/services/access-management-service.ts");
  assert.match(source, /access\.team-created/);
  assert.match(source, /access\.user-invited/);
  assert.match(source, /access\.project-team-assigned/);
  assert.match(source, /access\.user-deactivated/);
});

test("local API exposes cloud access directory route", () => {
  const source = read("desktop/src/services/local-api-server.ts");
  assert.match(source, /\/api\/access\/cloud\/directory/);
  assert.match(source, /\/api\/access\/cloud\/teams/);
});

test("portal uses local project access context in authorization", () => {
  const source = read("src/lib/projects/authorization.ts");
  assert.match(source, /localGetProjectAccessContext/);
});

test("users page renders shared cloud access client in desktop mode", () => {
  const page = read("src/app/(portal)/users/page.tsx");
  assert.match(page, /DesktopCloudAccessManagementClient/);
  assert.match(page, /Manage teams, users, project assignments, and invitations/);
});

test("navigation hides users and activity for unauthorized roles", () => {
  const navItems = read("src/lib/portal/nav-items.server.ts");
  assert.match(navItems, /canManageUsersAndAccess/);
  assert.match(navItems, /adminOnly/);
  const navigation = read("src/lib/portal/navigation.ts");
  assert.match(navigation, /Users/);
  assert.match(navigation, /viewerHidden/);
});

test("project navigation restricts viewers to displays", () => {
  const source = read("src/components/projects/ProjectNav.tsx");
  assert.match(source, /projectRole/);
  assert.match(source, /isViewer/);
  assert.match(source, /\/displays/);
});

test("dashboard replaces activity card for pure viewers", () => {
  const page = read("src/app/(portal)/dashboard/page.tsx");
  assert.match(page, /isPureViewer/);
  assert.match(page, /Accessible Displays/);
});

test("data migration creates default team once", () => {
  const source = read("desktop/src/services/access-data-migration.ts");
  assert.match(source, /ACCESS_DATA_MIGRATION_KEY/);
  assert.match(source, /Hildreth Media Group/);
  assert.match(source, /alreadyApplied/);
});

test("owner protection prevents deactivation in management service", () => {
  const source = read("desktop/src/services/access-management-service.ts");
  assert.match(source, /The Owner account cannot be deactivated/);
  assert.match(source, /Only the Owner may assign the Admin role/);
});

test("main wires access management service", () => {
  const source = read("desktop/src/main.ts");
  assert.match(source, /AccessManagementService/);
  assert.match(source, /setAccessManagement/);
});
