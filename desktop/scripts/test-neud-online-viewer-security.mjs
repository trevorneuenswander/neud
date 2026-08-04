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

function stripSqlComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

const migration = stripSqlComments(read("supabase/migrations/024_display_online_viewer.sql"));

const onlineViewerActivityTypes = [
  "display.online_viewer_enabled",
  "display.online_viewer_disabled",
  "display.online_visibility_changed",
  "display.online_published",
  "display.online_publish_failed",
  "display.online_publish_resumed",
];

const publishingRpcs = [
  "acquire_project_publisher_lease",
  "renew_project_publisher_lease",
  "release_project_publisher_lease",
  "publish_project_canonical_snapshot",
  "set_project_online_publishing_enabled",
];

test("1 anonymous access path requires public visibility and enabled viewer", () => {
  assert.match(migration, /online_viewer_enabled = true/);
  assert.match(migration, /if v_display\.online_visibility = 'private'/);
  assert.match(migration, /if v_user_id is null or not public\.can_view_project/);
  assert.match(migration, /grant execute on function public\.get_online_display_viewer_bundle[^;]* to anon/);
});

test("2 private displays deny anonymous callers with not_found", () => {
  assert.match(migration, /return jsonb_build_object\('ok', false, 'code', 'not_found'\)/);
  assert.doesNotMatch(migration, /grant execute on function public\.list_online_project_displays[^;]* to anon/);
});

test("3 disabled displays are filtered before authorization branch", () => {
  const bundleFn = migration.match(
    /create or replace function public\.get_online_display_viewer_bundle[\s\S]*?end;\s*\$\$/i,
  )?.[0];
  assert.ok(bundleFn);
  const enabledIndex = bundleFn.indexOf("online_viewer_enabled = true");
  const privateIndex = bundleFn.indexOf("online_visibility = 'private'");
  assert.ok(enabledIndex >= 0 && privateIndex > enabledIndex);
});

test("4-6 authenticated membership uses can_view_project for private displays", () => {
  assert.match(migration, /public\.can_view_project\(v_project\.id\)/);
  assert.match(migration, /grant execute on function public\.get_online_display_viewer_bundle[^;]* to authenticated/);
  assert.match(migration, /grant execute on function public\.list_online_project_displays[^;]* to authenticated/);
});

test("7 unrelated authenticated users receive not_found via can_view_project", () => {
  assert.match(migration, /not public\.can_view_project\(v_project\.id\)/);
  assert.match(migration, /'code', 'not_found'/);
});

test("8 removed membership is enforced by can_view_project on each call", () => {
  assert.match(migration, /security definer[\s\S]*get_online_display_viewer_bundle[\s\S]*can_view_project/);
});

test("9 disabled online viewing blocks reads via online_viewer_enabled filter", () => {
  assert.match(migration, /and online_viewer_enabled = true/);
});

test("10 public-to-private enforcement uses same not_found response for anonymous", () => {
  assert.match(migration, /online_visibility = 'private'/);
  assert.match(migration, /if v_user_id is null or not public\.can_view_project/);
  assert.match(migration, /'code', 'not_found'/);
});

test("11 list_online_project_displays only returns online_viewer_enabled rows", () => {
  assert.match(migration, /list_online_project_displays/);
  assert.match(migration, /online_viewer_enabled = true[\s\S]*can_view_project\(p_project_id\)/);
});

test("12 bundle uses online_published_revision_id not active_revision_id", () => {
  assert.match(migration, /online_published_revision_id/);
  assert.doesNotMatch(migration, /active_revision_id/);
});

test("13 draft revisions are excluded by revision id join constraint", () => {
  assert.match(migration, /where id = v_display\.online_published_revision_id/);
  assert.match(migration, /and display_id = v_display\.id/);
});

test("14 bundle excludes membership and user-directory fields", () => {
  const bundleFn = migration.match(
    /create or replace function public\.get_online_display_viewer_bundle[\s\S]*?end;\s*\$\$/i,
  )?.[0];
  assert.ok(bundleFn);
  assert.doesNotMatch(bundleFn, /project_members/);
  assert.doesNotMatch(bundleFn, /profiles/);
  assert.doesNotMatch(bundleFn, /email/);
  assert.doesNotMatch(bundleFn, /phone/);
});

test("15 bundle excludes secrets and scraper configuration fields", () => {
  const bundleFn = migration.match(
    /create or replace function public\.get_online_display_viewer_bundle[\s\S]*?end;\s*\$\$/i,
  )?.[0];
  assert.ok(bundleFn);
  assert.doesNotMatch(bundleFn, /service_role/);
  assert.doesNotMatch(bundleFn, /scraper/);
  assert.doesNotMatch(bundleFn, /credential/);
  assert.match(bundleFn, /payload->'data'/);
});

test("16 invalid slugs return uniform not_found without existence leak", () => {
  assert.match(migration, /if not found then[\s\S]*'code', 'not_found'/);
  assert.match(migration, /if p_project_slug is null[\s\S]*'code', 'not_found'/);
});

test("17 RPC EXECUTE grants match viewer security model", () => {
  assert.match(migration, /revoke all on function public\.get_online_display_viewer_bundle/);
  assert.match(migration, /revoke execute on function public\.get_online_display_viewer_bundle[^;]* from service_role/);
  assert.match(migration, /revoke execute on function public\.list_online_project_displays[^;]* from service_role/);
  assert.match(migration, /revoke execute on function public\.list_online_project_displays[^;]* from anon/);
});

test("18 service_role and anon do not receive publishing permissions in 024", () => {
  for (const rpc of publishingRpcs) {
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${rpc}[^;]* to anon`));
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${rpc}[^;]* to service_role`));
  }
  assert.doesNotMatch(migration, /grant execute on function public\.upsert_activity_events_for_sync[^;]* to anon/);
  assert.doesNotMatch(migration, /grant execute on function public\.upsert_activity_events_for_sync[^;]* to service_role/);
});

test("SECURITY DEFINER functions pin search_path = public", () => {
  const functions = migration.match(/create or replace function public\.[^\n]+[\s\S]*?\$\$/gi) ?? [];
  assert.ok(functions.length >= 3);
  for (const fn of functions) {
    assert.match(fn, /security definer[\s\S]*set search_path = public/i);
  }
});

test("anonymous public bundle omits project name", () => {
  assert.match(migration, /if v_user_id is null then/);
  assert.match(migration, /v_project_json := jsonb_build_object\(\s*'slug', v_project\.slug\s*\)/);
  assert.match(migration, /'name', v_project\.name/);
});

test("hosted portal does not preload private display metadata on anonymous pages", () => {
  const publicPage = read("src/app/view/[projectSlug]/[displaySlug]/page.tsx");
  assert.doesNotMatch(publicPage, /list_online_project_displays/);
  assert.match(publicPage, /mode="public"/);
});

test("hosted portal blocks desktop-only publishing routes", () => {
  const proxy = read("src/lib/supabase/proxy.ts");
  const hostedRoutes = read("src/lib/routing/hosted-routes.ts");
  assert.match(proxy, /isHostedDesktopOnlyPath/);
  assert.match(hostedRoutes, /HOSTED_DESKTOP_ONLY_PATTERNS/);
});

test("online viewer activity types are allowlisted in migration 024", () => {
  for (const eventType of onlineViewerActivityTypes) {
    assert.match(migration, new RegExp(`'${eventType.replace(".", "\\.")}'`));
  }
});

test("developer-tools emits dedicated online viewer activity types", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /display\.online_viewer_enabled/);
  assert.match(service, /display\.online_viewer_disabled/);
  assert.match(service, /display\.online_visibility_changed/);
  assert.doesNotMatch(service, /Enabled online viewer[\s\S]*display\.published/);
});

test("display sync emits online publish lifecycle activity types", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /display\.online_published/);
  assert.match(sync, /display\.online_publish_failed/);
  assert.match(sync, /display\.online_publish_resumed/);
});

test("migration 026 fixes viewer bundle lease column and auth code", () => {
  const migration = stripSqlComments(read("supabase/migrations/026_fix_viewer_bundle_rpc.sql"));
  assert.match(migration, /lease_expires_at/);
  assert.doesNotMatch(migration, /v_lease\.expires_at/);
  assert.match(migration, /'authentication_required'/);
  assert.match(migration, /'published_revision_id', v_display\.online_published_revision_id/);
  assert.match(migration, /grant execute on function public\.get_online_display_viewer_bundle[^;]* to authenticated/);
});
