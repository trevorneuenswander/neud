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

test("authorize_hosted_photo_asset grants authenticated project members", () => {
  const migration = read("supabase/migrations/039_project_photo_delivery.sql");
  assert.match(migration, /can_view_project\(v_project_id\)/);
  assert.match(migration, /grant execute on function public\.authorize_hosted_photo_asset/);
  assert.match(migration, /to authenticated/);
});

test("authorize_hosted_photo_asset allows anonymous public display assets only", () => {
  const migration = read("supabase/migrations/039_project_photo_delivery.sql");
  assert.match(migration, /online_visibility = 'public'/);
  assert.match(migration, /asset_referenced_in_canonical/);
  assert.match(migration, /grant execute on function public\.authorize_hosted_photo_asset/);
  assert.match(migration, /to anon/);
});

test("asset authorization rejects cross-project assets", () => {
  const migration = read("supabase/migrations/039_project_photo_delivery.sql");
  assert.match(migration, /a\.project_id = v_project_id/);
});

test("hosted photo proxy route requires project and display slugs", () => {
  const route = read("src/app/api/hosted/photos/[assetId]/route.ts");
  assert.match(route, /projectSlug/);
  assert.match(route, /displaySlug/);
  assert.match(route, /authorize_hosted_photo_asset/);
  assert.doesNotMatch(route, /listBuckets/);
});

test("hosted photo resolver uses stable proxy URLs not signed URLs in canonical JSON", () => {
  const resolver = read("src/lib/hosted/resolve-hosted-photo-urls.ts");
  assert.match(resolver, /\/api\/hosted\/photos\//);
  assert.doesNotMatch(resolver, /createSignedUrl/);
});

test("canonical photo sanitizer strips localUrl but preserves storageObjectId", () => {
  const canonical = read("shared/display-runtime/canonical-photo.ts");
  assert.match(canonical, /sanitizeCanonicalPhoto/);
  assert.match(canonical, /storageObjectId/);
  assert.match(canonical, /PUBLISHED_PHOTO_KEYS/);
  assert.doesNotMatch(canonical, /published\.localUrl/);
});

test("photo proxy signs URLs server-side with bounded expiry", () => {
  const route = read("src/app/api/hosted/photos/[assetId]/route.ts");
  assert.match(route, /createAdminClient/);
  assert.match(route, /createSignedUrl/);
  assert.match(route, /60 \* 60/);
});
