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

test("desktop uses trusted portal origin for admin invites", () => {
  const main = read("desktop/src/main.ts");
  const client = read("desktop/src/services/desktop-admin-api-client.ts");
  const resolver = read("desktop/src/services/trusted-portal-origin.ts");

  assert.match(main, /resolveTrustedPortalOrigin/);
  assert.match(main, /new DesktopAdminApiClient\(trustedPortal\.origin/);
  assert.doesNotMatch(main, /new DesktopAdminApiClient\(appUrl/);
  assert.match(client, /trustedPortalOrigin/);
  assert.match(client, /Trusted portal origin must use HTTPS in production/);
  assert.match(resolver, /NEUD_TRUSTED_PORTAL_ORIGIN/);
  assert.match(resolver, /trusted_portal_origin_missing/);
});

test("packaged desktop fails safely without trusted portal origin", () => {
  const resolver = read("desktop/src/services/trusted-portal-origin.ts");
  assert.match(resolver, /allowLocalDevFallback/);
  assert.match(resolver, /trusted_portal_origin_missing/);
});

test("invite route includes rate limiting and sanitized errors", () => {
  const route = read("src/app/api/desktop/admin/invite-user/route.ts");
  assert.match(route, /checkRateLimit/);
  assert.match(route, /rate_limited/);
  assert.doesNotMatch(route, /error\?\.message/);
});
