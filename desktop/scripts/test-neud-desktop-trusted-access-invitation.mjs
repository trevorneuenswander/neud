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

test("desktop trusted access client uses coordinator cloud access token", () => {
  const client = read("desktop/src/services/desktop-trusted-access-api-client.ts");
  const coordinator = read("desktop/src/services/authenticated-cloud-coordinator.ts");
  assert.match(client, /getCloudAccessToken/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(client, /client\.auth\.getSession\(\)/);
  assert.match(coordinator, /getCloudAccessToken/);
});

test("desktop trusted access client maps 401 and 403 separately", () => {
  const client = read("desktop/src/services/desktop-trusted-access-api-client.ts");
  assert.match(client, /response\.status === 401/);
  assert.match(client, /response\.status === 403/);
  assert.match(client, /TrustedAccessRequestError/);
});

test("trusted access caller helper supports bearer and browser session", () => {
  const helper = read("src/lib/access-management/resolve-trusted-access-caller.ts");
  const verify = read("src/lib/access-management/verify-access-request.ts");
  assert.match(helper, /resolveTrustedAccessCaller/);
  assert.match(helper, /bearerToken/);
  assert.match(verify, /resolveTrustedAccessCaller/);
});

test("invitation probe route is non-mutating auth check", () => {
  const probe = read("src/app/api/access/invitations/probe/route.ts");
  assert.match(probe, /export async function GET/);
  assert.match(probe, /resolveTrustedAccessCallerWithAuthDiagnostics/);
  assert.doesNotMatch(probe, /inviteUserByEmail/);
  assert.doesNotMatch(probe, /create_cloud_invitation/);
});

test("invitation email failures are distinct from authentication_required", () => {
  const route = read("src/app/api/access/invitations/route.ts");
  const client = read("desktop/src/services/desktop-trusted-access-api-client.ts");
  const errors = read("src/lib/access-management/errors.ts");
  assert.match(route, /auth_admin_invite_failed/);
  assert.match(client, /invitation_service_unavailable/);
  assert.match(client, /auth_admin_invite_failed/);
  assert.match(errors, /auth_admin_invite_failed/);
});

test("diagnose access invitation script exists", () => {
  const pkg = read("package.json");
  assert.match(pkg, /diagnose:access-invitation/);
});
