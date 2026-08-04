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

test("runtime helpers distinguish desktop and hosted modes", () => {
  const env = read("src/lib/runtime/environment.ts");
  assert.match(env, /isDesktopRuntime/);
  assert.match(env, /isHostedWebRuntime/);
  assert.match(env, /shouldUseLocalData/);
});

test("hosted portal routes and guards exist", () => {
  const hostedRoutes = read("src/lib/routing/hosted-routes.ts");
  const proxy = read("src/lib/supabase/proxy.ts");
  const startup = read("src/lib/routing/startup-paths.ts");

  assert.match(hostedRoutes, /HOSTED_PORTAL_PREFIX = "\/portal"/);
  assert.match(hostedRoutes, /getPrivateDisplayViewerPath/);
  assert.match(hostedRoutes, /isHostedViewerPath/);
  assert.match(proxy, /isHostedDesktopOnlyPath/);
  assert.match(proxy, /isHostedViewerPath/);
  assert.match(startup, /DEFAULT_HOSTED_LANDING_PATH = "\/portal"/);
});

test("canonical JSON page redirects instead of exposing viewer UI", () => {
  const page = read("src/app/(portal)/projects/[slug]/canonical/page.tsx");
  const nav = read("src/components/projects/ProjectNav.tsx");
  assert.match(page, /redirect\(/);
  assert.doesNotMatch(nav, /Canonical JSON/);
});

test("online viewer schema and RPC migration exists", () => {
  const migration = read("supabase/migrations/024_display_online_viewer.sql");
  assert.match(migration, /online_viewer_enabled/);
  assert.match(migration, /online_visibility/);
  assert.match(migration, /get_online_display_viewer_bundle/);
  assert.match(migration, /list_online_project_displays/);
});

test("hosted portal pages and viewer client exist", () => {
  assert.match(read("src/app/portal/page.tsx"), /Portal Dashboard/);
  assert.match(read("src/components/hosted/HostedDisplayViewerClient.tsx"), /resolveViewerStatusNotice/);
  assert.match(read("src/components/displays/OnlineViewerPanel.tsx"), /Online Viewer/);
});
