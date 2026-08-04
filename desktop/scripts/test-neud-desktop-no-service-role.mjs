#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const seededSecret = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.slice2_2_fake_service_role_secret";

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function walkFiles(dir, matches = []) {
  if (!fs.existsSync(dir)) {
    return matches;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, matches);
    } else if (/\.(js|cjs|mjs|json|html|txt|env|yml|yaml)$/i.test(entry.name)) {
      matches.push(fullPath);
    }
  }
  return matches;
}

test("desktop production services do not reference service-role client helpers", () => {
  const main = read("desktop/src/main.ts");
  const credentialStore = read("desktop/src/services/credential-store.ts");

  assert.doesNotMatch(main, /getSupabaseMain/);
  assert.doesNotMatch(main, /loadServerConfig/);
  assert.doesNotMatch(main, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(main, /auth\.admin\./);
  assert.doesNotMatch(credentialStore, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(credentialStore, /loadServerConfig/);
  assert.match(credentialStore, /loadSupabasePublicConfigFromPaths/);
  assert.equal(
    fs.existsSync(path.join(desktopRoot, "src/services/supabase-main.ts")),
    false,
  );
});

test("cloud sync services use AuthenticatedCloudCoordinator", () => {
  const displaySync = read("desktop/src/services/display-sync/display-sync-service.ts");
  const activitySync = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  const directorySync = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  const identity = read("desktop/src/services/supabase-identity-service.ts");

  assert.match(displaySync, /AuthenticatedCloudCoordinator/);
  assert.match(activitySync, /AuthenticatedCloudCoordinator/);
  assert.match(directorySync, /get_authorized_users_directory/);
  assert.doesNotMatch(directorySync, /auth\.admin\.listUsers/);
  assert.doesNotMatch(identity, /auth\.admin\./);
});

test("019 migration adds display and activity authenticated authorization", () => {
  const migration = read("supabase/migrations/019_desktop_authenticated_cloud_auth.sql");
  assert.match(migration, /displays_select/);
  assert.match(migration, /upsert_activity_events_for_sync/);
  assert.match(migration, /upsert_desktop_host_for_client/);
  assert.match(migration, /get_authorized_users_directory/);
});

test("full desktop dist output excludes seeded service-role secret", () => {
  const distRoot = path.join(desktopRoot, "dist");
  const files = walkFiles(distRoot);
  assert.ok(files.length > 0, "expected desktop dist output");

  for (const filePath of files) {
    const contents = fs.readFileSync(filePath, "utf8");
    assert.doesNotMatch(contents, new RegExp(seededSecret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(contents, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(contents, /supabaseServiceRoleKey/);
    assert.doesNotMatch(contents, /getSupabaseMain/);
  }
});

test("trusted admin invite route exists on Next.js server boundary", () => {
  const route = read("src/app/api/desktop/admin/invite-user/route.ts");
  const verify = read("src/lib/desktop-admin/verify-desktop-admin-request.ts");
  assert.match(route, /createAdminClient/);
  assert.match(verify, /server-only/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_/);
});
