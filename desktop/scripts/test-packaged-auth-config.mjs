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

test("packaged auth config generator rejects placeholder publishable keys", () => {
  const generator = read("desktop/scripts/generate-cloud-runtime-config.mjs");
  assert.match(generator, /isPlaceholderSupabasePublishableKey/);
  assert.match(generator, /endsWith\("\.test"\)/);
  assert.match(generator, /\.env\.local wins over stale shell exports/);
  assert.match(generator, /Refusing to package an invalid or placeholder Supabase publishable key/);
});

test("renderer auth uses desktop runtime Supabase config in packaged mode", () => {
  const browserClient = read("src/lib/supabase/browser-client.ts");
  const signIn = read("src/lib/auth/client-sign-in.ts");
  assert.match(browserClient, /getSupabasePublicConfig/);
  assert.match(browserClient, /isValidSupabasePublishableKey/);
  assert.match(signIn, /recordAuthLoginDiagnostic/);
  assert.match(signIn, /auth\.supabase\.sign_in\.failed/);
});

test("electron main exposes Supabase public config IPC without service role", () => {
  const ipc = read("desktop/src/ipc/supabase-public-config.ts");
  const preload = read("desktop/src/preload.ts");
  assert.match(ipc, /getSupabasePublicConfig/);
  assert.match(ipc, /recordAuthLoginDiagnostic/);
  assert.match(preload, /neud:app:getSupabasePublicConfig/);
  assert.doesNotMatch(ipc, /SERVICE_ROLE/);
});

test("packaged loader prefers runtime cloud.json before invalid process env", () => {
  const loader = read("desktop/src/services/supabase-public-config.ts");
  assert.match(loader, /isPackagedDesktopRuntime/);
  assert.match(loader, /packaged_runtime_json/);
  assert.match(loader, /isValidSupabasePublishableKey/);
});

test("packaged cloud config verifier rejects placeholder keys", () => {
  const verify = read("desktop/scripts/verify-packaged-cloud-config.mjs");
  assert.match(verify, /endsWith\("\.test"\)/);
});
