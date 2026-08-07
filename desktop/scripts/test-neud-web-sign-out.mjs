#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("web sign-out awaits Supabase signOut before redirecting", () => {
  const source = read("src/lib/auth/force-local-sign-out.ts");
  assert.match(source, /async function clearRemoteSupabaseSession/);
  assert.match(source, /await clearRemoteSupabaseSession\(\)/);
  assert.match(source, /await resetNextSessionCache\(\)/);
  assert.match(source, /window\.location\.replace\("\/"\)/);
  assert.doesNotMatch(source, /fireAndForgetRemoteSignOut/);
});

test("logout button disables while sign-out is in progress", () => {
  const button = read("src/components/auth/LogoutButton.tsx");
  assert.match(button, /disabled=\{pending\}/);
  assert.match(button, /forceLocalSignOut\("sidebar-sign-out"\)/);
});

test("hosted sign-out redirects after session cleanup on web fallback", () => {
  const source = read("src/lib/auth/force-local-sign-out.ts");
  assert.match(source, /redirectToPublicLanding/);
  assert.match(source, /await clearRemoteSupabaseSession\(\)/);
  assert.match(source, /window\.location\.replace\("\/"\)/);
});
