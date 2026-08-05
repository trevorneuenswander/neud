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

test("build generates packaged cloud runtime config", () => {
  const generator = read("desktop/scripts/generate-cloud-runtime-config.mjs");
  assert.match(generator, /runtime-config/);
  assert.match(generator, /cloud\.json/);
  assert.match(generator, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(generator, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(generator, /Refusing to package a service-role Supabase key/);
});

test("electron main loads packaged config with diagnostics", () => {
  const main = read("desktop/src/main.ts");
  const loader = read("desktop/src/services/supabase-public-config.ts");
  const runtime = read("desktop/src/services/cloud-runtime-config.ts");
  assert.match(main, /loadSupabasePublicConfigWithSource/);
  assert.match(main, /writeCloudRuntimeConfigDiagnostic/);
  assert.match(loader, /loadPackagedCloudRuntimeConfig/);
  assert.match(runtime, /runtime-config/);
});

test("release pipeline verifies packaged cloud config before NSIS", () => {
  const pkg = read("desktop/package.json");
  assert.match(pkg, /verify-packaged-cloud-config\.mjs/);
  const stage = read("desktop/scripts/stage-standalone.mjs");
  assert.match(stage, /generate-cloud-runtime-config\.mjs/);
});

test("display sync service writes startup log even when cloud config is missing", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /appendDisplaySyncLog/);
  assert.match(sync, /service\.init/);
  assert.match(sync, /service\.start/);
  assert.match(sync, /cloud_config_missing/);
  const main = read("desktop/src/main.ts");
  assert.match(main, /displaySyncService\.start\(\)/);
});

test("activity sync distinguishes missing cloud config from signed-out state", () => {
  const activity = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(activity, /isCloudConfigured\(\)/);
  assert.match(activity, /Cloud configuration is missing/);
  assert.match(activity, /Restoring cloud session/);
});
