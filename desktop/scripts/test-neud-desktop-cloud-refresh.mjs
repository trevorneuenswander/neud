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

const refreshModulePath = path.join(
  repoRoot,
  "desktop",
  "dist",
  "services",
  "supabase-session-refresh.js",
);

test("refresh classifier maps invalid refresh token auth codes", async () => {
  const modulePath = fs.existsSync(refreshModulePath)
    ? refreshModulePath
    : path.join(repoRoot, "desktop", "src", "services", "supabase-session-refresh.ts");
  if (!modulePath.endsWith(".js")) {
    const source = read("desktop/src/services/supabase-session-refresh.ts");
    assert.match(source, /invalid_refresh_token/);
    assert.match(source, /refresh_token_reused/);
    assert.match(source, /refresh_rate_limited/);
    return;
  }
  const { classifyRefreshFailure, refreshCodeToErrorCategory } = await import(
    `file:///${modulePath.replace(/\\/g, "/")}`
  );
  assert.equal(
    classifyRefreshFailure({ status: 401, code: "invalid_grant", message: "Invalid refresh token" }),
    "invalid_refresh_token",
  );
  assert.equal(
    refreshCodeToErrorCategory("refresh_token_reused"),
    "refresh_token_reused",
  );
});

test("refresh path uses refreshSession without setSession prerequisite", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(session, /refreshSession\(\{\s*refresh_token:/);
  assert.match(session, /refreshQueueTail/);
});

test("shared diagnostics capture HTTP status and safe refresh message", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  const shared = read("desktop/src/services/shared-cloud-auth-diagnostics.ts");
  assert.match(session, /refreshHttpStatus/);
  assert.match(session, /refreshSafeMessage/);
  assert.match(shared, /firstRefreshFailureStage/);
});

test("post cloud auth recovery orchestrates display sync and publishing", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /runPostCloudAuthRecovery/);
  assert.match(service, /ensureStarted\(`auth-recovered:/);
  assert.match(service, /syncNow\(`\$\{reason\}-auth-recovered`\)/);
});

test("diagnose desktop cloud refresh script exists", () => {
  const script = read("scripts/live-validation/diagnose-desktop-cloud-refresh.mjs");
  assert.match(script, /firstRefreshFailureStage/);
  assert.match(script, /refreshSafeMessage/);
  const pkg = read("package.json");
  assert.match(pkg, /diagnose:desktop-cloud-refresh/);
});
