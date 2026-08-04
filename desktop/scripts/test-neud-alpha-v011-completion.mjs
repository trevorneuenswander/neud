#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { migrationChecksum } from "../../scripts/live-validation/lib/migrations.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("034 desktop migration defines persisted photo upload states", () => {
  const migration = read("desktop/src/database/migrations/034_project_photo_uploads.sql");
  assert.match(migration, /project_photo_uploads/);
  assert.match(migration, /pending/);
  assert.match(migration, /uploading/);
  assert.match(migration, /uploaded/);
  assert.match(migration, /failed/);
  assert.match(migration, /orphan_candidate/);
});

test("cloud photo asset service uses repository not in-memory-only records", () => {
  const service = read("desktop/src/services/cloud-photo-asset-service.ts");
  assert.match(service, /ProjectPhotoUploadRepository/);
  assert.doesNotMatch(service, /private readonly records = new Map/);
});

test("manual photo import registers upload records and triggers retry", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /registerLocalPhoto/);
  assert.match(service, /retryPendingPhotoUploads/);
  assert.match(service, /notifyLocalControllerStateChanged\(projectId, "controller\.lot\.photos-added"\)/);
});

test("039 migration authorizes hosted photo assets for public and private viewers", () => {
  const migration = read("supabase/migrations/039_project_photo_delivery.sql");
  assert.match(migration, /authorize_hosted_photo_asset/);
  assert.match(migration, /grant execute on function public\.authorize_hosted_photo_asset/);
  assert.match(migration, /to anon/);
});

test("hosted photo proxy route uses server-side signing", () => {
  const route = read("src/app/api/hosted/photos/[assetId]/route.ts");
  assert.match(route, /authorize_hosted_photo_asset/);
  assert.match(route, /createAdminClient/);
  assert.match(route, /createSignedUrl/);
  assert.doesNotMatch(route, /NEXT_PUBLIC/);
});

test("040 migration defines complete access mutation RPC grants", () => {
  const migration = read("supabase/migrations/040_access_management_mutations.sql");
  for (const fn of [
    "update_team",
    "archive_team",
    "upsert_team_member",
    "remove_team_member",
    "remove_project_team",
    "upsert_project_member",
    "remove_project_member",
    "create_cloud_invitation",
    "revoke_cloud_invitation",
    "accept_cloud_invitation",
  ]) {
    assert.match(migration, new RegExp(`function public\\.${fn}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}`));
  }
});

test("desktop users page uses shared cloud access client", () => {
  const page = read("src/app/(portal)/users/page.tsx");
  assert.match(page, /DesktopCloudAccessManagementClient/);
  assert.doesNotMatch(page, /LocalUsersAccessClient/);
});

test("desktop cloud access API exposes cloud directory endpoint", () => {
  const api = read("src/lib/local/cloud-access-api.ts");
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(api, /\/api\/access\/cloud\/directory/);
  assert.match(server, /\/api\/access\/cloud\/directory/);
});

test("migration checksums are stable for 039 and 040", () => {
  const m039 = read("supabase/migrations/039_project_photo_delivery.sql");
  const m040 = read("supabase/migrations/040_access_management_mutations.sql");
  assert.equal(typeof migrationChecksum(m039), "string");
  assert.equal(typeof migrationChecksum(m040), "string");
  assert.match(m039, /039_project_photo_delivery\.sql/);
  assert.match(m040, /040_access_management_mutations\.sql/);
});
