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

test("hosted invite client uses cookie-backed hosted API path", () => {
  const client = read("src/lib/access-management/invitation-client.ts");
  assert.match(client, /credentials: "include"/);
  assert.match(client, /\/api\/access\/invitations/);
  assert.match(client, /resolveAccessInviteRuntime/);
  assert.match(client, /hosted-web/);
});

test("hosted invite client attaches browser session bearer token", () => {
  const client = read("src/lib/access-management/invitation-client.ts");
  assert.match(client, /buildInviteRequestHeaders/);
  assert.match(client, /supabase\.auth\.getSession\(\)/);
  assert.match(client, /headers\.Authorization = `Bearer \$\{token\}`/);
});

test("hosted web does not surface false offline_required code", () => {
  const client = read("src/lib/access-management/invitation-client.ts");
  assert.match(client, /runtime === "hosted-web" && code === "offline_required"/);
});

test("invite API resolves session with getClaims like requireUser", () => {
  const session = read("src/lib/auth/hosted-route-session.ts");
  const verify = read("src/lib/access-management/verify-access-request.ts");
  const auth = read("src/lib/auth/authorization.ts");
  assert.match(session, /getClaims\(\)/);
  assert.match(auth, /getClaims\(\)/);
  assert.match(verify, /resolveTrustedAccessCaller/);
  assert.match(session, /resolveHostedRouteSession/);
  assert.doesNotMatch(verify, /getUser\(\)/);
});

test("invite API reads auth cookies from incoming request", () => {
  const routeHandler = read("src/lib/supabase/route-handler.ts");
  const session = read("src/lib/auth/hosted-route-session.ts");
  assert.match(routeHandler, /createClientFromRequest/);
  assert.match(routeHandler, /requestHasSupabaseAuthCookies/);
  assert.match(session, /createClientFromRequest/);
});

test("invite API logs sanitized diagnostics with access-invite prefix", () => {
  const session = read("src/lib/auth/hosted-route-session.ts");
  const route = read("src/app/api/access/invitations/route.ts");
  assert.match(session, /\[access-invite\]/);
  assert.match(route, /logHostedRouteSessionDiagnostics/);
  assert.match(route, /invite\.authentication_required/);
  assert.doesNotMatch(route, /access_token/);
  assert.doesNotMatch(route, /refresh_token/);
});

test("authentication_required maps to sign-in message", () => {
  const errors = read("src/lib/access-management/errors.ts");
  assert.match(errors, /authentication_required: "Sign in to manage access\."/);
});

test("forbidden remains distinct from authentication_required", () => {
  const errors = read("src/lib/access-management/errors.ts");
  assert.match(errors, /forbidden: "You do not have permission to perform this action\."/);
});

test("desktop trusted access API distinguishes auth from offline", () => {
  const trusted = read("desktop/src/services/desktop-trusted-access-api-client.ts");
  assert.match(trusted, /getCloudAccessToken/);
  assert.match(trusted, /TrustedAccessRequestError/);
  assert.match(trusted, /response\.status === 401/);
});

test("local data service no longer maps missing trusted API to offline invite error", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /Cloud access invitations are not configured/);
  assert.doesNotMatch(service, /createCloudAccessInvitation[\s\S]*requires an internet connection/);
});

test("hosted portal users page uses cloud access management client", () => {
  const page = read("src/app/portal/users/page.tsx");
  const client = read("src/components/access-management/CloudAccessManagementClient.tsx");
  assert.match(page, /CloudAccessManagementClient/);
  assert.match(client, /isOnline/);
});
