import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("route helpers use canonical project overview and user details paths", () => {
  const routes = read("src/lib/routes/activity-navigation.ts");
  assert.match(routes, /getProjectOverviewHref/);
  assert.match(routes, /`\/projects\/\$\{encodeURIComponent\(projectSlug\)\}`/);
  assert.match(routes, /getUserDetailsHref/);
  assert.match(routes, /`\/users\/\$\{encodeURIComponent\(userId\)\}`/);
});

test("activity link components render semantic Next.js links with stopPropagation", () => {
  const projectLink = read("src/components/activity/ActivityProjectLink.tsx");
  const userLink = read("src/components/activity/ActivityUserLink.tsx");
  assert.match(projectLink, /from "next\/link"/);
  assert.match(projectLink, /getProjectOverviewHref/);
  assert.match(projectLink, /stopPropagation/);
  assert.match(projectLink, /Project no longer available/);
  assert.match(userLink, /getUserDetailsHref/);
  assert.match(userLink, /ACTIVITY_SYSTEM_ACTOR_LABEL/);
  assert.match(userLink, /stopPropagation/);
});

test("activity tables use shared project and user link components", () => {
  const compact = read("src/components/activity/CompactActivityTable.tsx");
  const full = read("src/components/activity/ActivityTable.tsx");
  for (const source of [compact, full]) {
    assert.match(source, /ActivityProjectLink/);
    assert.match(source, /ActivityUserLink/);
    assert.doesNotMatch(source, /onClick=\{href \? \(\) => router\.push/);
  }
});

test("activity normalization resolves actor and project availability identifiers", () => {
  const normalize = read("src/lib/activity/normalize.ts");
  assert.match(normalize, /actorId/);
  assert.match(normalize, /projectAvailable/);
  assert.match(normalize, /readMetadataString\(metadata, "userId"\)/);
});

test("dashboard and desktop activity payloads include actorId", () => {
  const dashboardTypes = read("src/lib/dashboard/types.ts");
  const localData = read("desktop/src/services/local-data-service.ts");
  const activityDisplay = read("desktop/src/services/activity-display.ts");
  assert.match(dashboardTypes, /actorId\?: string/);
  assert.match(localData, /actorId: entry\.actorId/);
  assert.match(activityDisplay, /actorId/);
});

test("user details page and API enforce permission-aware loading", () => {
  const page = read("src/app/(portal)/users/[userId]/page.tsx");
  const client = read("src/components/users/UserDetailsClient.tsx");
  const view = read("src/components/users/UserDetailsView.tsx");
  const api = read("desktop/src/services/local-api-server.ts");
  const auth = read("desktop/src/services/access-authorization-service.ts");
  assert.match(page, /UserDetailsClient/);
  assert.match(client, /Permission denied/);
  assert.match(view, /Not provided/);
  assert.ok(api.includes("getUserDetails"));
  assert.ok(api.includes("accessUserMatch"));
  assert.match(api, /\/api\/access\/viewable-user-ids/);
  assert.match(auth, /canViewUserDetails/);
  assert.match(auth, /listViewableUserIds/);
});

test("user details resolves effective projects and phone migration exists", () => {
  const management = read("desktop/src/services/access-management-service.ts");
  const migration = read("desktop/src/database/migrations/018_local_users_phone.sql");
  const migrate = read("desktop/src/database/migrate.ts");
  assert.match(management, /resolveProjectAccessPaths/);
  assert.match(management, /accessibleProjectIds/);
  assert.match(management, /phone: user\.phone/);
  assert.match(migration, /ADD COLUMN phone TEXT/);
  assert.match(migrate, /018_local_users_phone\.sql/);
});

test("activity csv export remains plain text values", () => {
  const fullView = read("src/components/activity/ActivityFullView.tsx");
  const csv = read("src/lib/activity/csv-export.ts");
  assert.match(fullView, /projectName: event\.projectName/);
  assert.match(fullView, /user: event\.actorName/);
  assert.doesNotMatch(csv, /<Link|<a /);
});

test("activity views fetch linkable user ids once via shared hook", () => {
  const hook = read("src/lib/activity/use-linkable-user-ids.ts");
  const dashboard = read("src/components/dashboard/DashboardActivityClient.tsx");
  const full = read("src/components/activity/ActivityFullView.tsx");
  assert.match(hook, /localGetViewableUserIds/);
  assert.match(dashboard, /useLinkableUserIds/);
  assert.match(full, /useLinkableUserIds/);
});

test("user details API response excludes sensitive auth fields", () => {
  const management = read("desktop/src/services/access-management-service.ts");
  assert.doesNotMatch(management, /password/);
  assert.doesNotMatch(management, /token/);
  assert.match(management, /fullName: user\.fullName/);
  assert.match(management, /email: user\.email/);
  assert.match(management, /phone: user\.phone/);
});
