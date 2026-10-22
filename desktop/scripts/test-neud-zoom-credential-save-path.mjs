#!/usr/bin/env node
/**
 * Regression: Zoom Developer Setup Save must not misreport CORS/HTTP failures
 * as "Local API could not be reached" when the local API is healthy.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("ZOOM SAVE: renderer PUT path + body fields (no Account ID / secret)", () => {
  const api = read("src/lib/local/zoom-integration-api.ts");
  assert.match(api, /\/api\/integrations\/zoom\/app-credentials/);
  assert.match(api, /method:\s*["']PUT["']/);
  assert.match(api, /publicClientId/);
  assert.doesNotMatch(api, /clientSecret/);
  assert.doesNotMatch(api, /accountId\s*:/);

  const client = read("src/components/live-chat/LiveChatClient.tsx");
  assert.match(client, /localSaveZoomAppCredentials/);
  assert.match(client, /Save Zoom OAuth Settings|Save Public Client ID/);
  assert.doesNotMatch(client, /Account ID/);
});

test("ZOOM SAVE: local API registers PUT app-credentials route", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /\/api\/integrations\/zoom\/app-credentials/);
  assert.match(server, /request\.method === ["']PUT["']/);
  assert.match(server, /saveAppCredentials/);
  assert.match(server, /publicClientId/);
  assert.doesNotMatch(server, /body\.accountId/);
  assert.doesNotMatch(server, /body\.clientSecret/);
});

test("ZOOM SAVE: CORS Allow-Methods includes PUT (regression for misleading unreachable)", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(
    server,
    /Access-Control-Allow-Methods["']?\s*,\s*[\s\n]*["']GET, POST, PUT, PATCH, DELETE, OPTIONS["']/,
  );
  // Explicitly guard against the pre-fix header that omitted PUT.
  assert.doesNotMatch(
    server,
    /Access-Control-Allow-Methods["']?\s*,\s*["']GET, POST, PATCH, DELETE, OPTIONS["']/,
  );
});

test("ZOOM SAVE: HTTP errors are not labeled Local API unreachable", () => {
  const origin = read("src/lib/local/local-api-origin.ts");
  assert.match(origin, /formatLocalApiHttpError/);
  assert.match(origin, /route_not_found/);
  assert.match(origin, /http_client_error/);
  assert.match(origin, /http_server_error/);

  const fetchApi = read("src/lib/local/api.ts");
  assert.match(fetchApi, /formatLocalApiHttpError/);
  assert.match(fetchApi, /reachedLocalApi:\s*true/);
  assert.match(fetchApi, /reachedLocalApi:\s*false/);
  // Network classification only after LocalApiError check.
  assert.match(
    fetchApi,
    /if \(error instanceof LocalApiError\) \{\s*throw error;/,
  );
  assert.match(fetchApi, /\[neud-zoom-cred\] renderer request/);
});

test("ZOOM SAVE: safeStorage required — no plaintext fallback", () => {
  const store = read("desktop/src/integrations/zoom/zoom-credential-store.ts");
  assert.match(store, /safeStorage/);
  assert.match(store, /isEncryptionAvailable/);
  assert.match(store, /Secure credential storage is unavailable/);
  assert.match(store, /Failed to encrypt Zoom credentials/);
  assert.match(store, /Failed to write Zoom credential file/);
  assert.match(store, /zoom-app\.cred/);
  assert.match(store, /No plaintext fallback/);
  // Writes must go through safeStorage.encryptString — never raw JSON.stringify to disk.
  assert.match(
    store,
    /writeFileSync\(\s*file,\s*encrypted\s*\)/,
  );
  assert.doesNotMatch(
    store,
    /writeFileSync\([^)]*JSON\.stringify\(payload\)\s*\)/,
  );
});

test("ZOOM SAVE: distinct backend error codes for credential failures", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /SAFE_STORAGE_UNAVAILABLE/);
  assert.match(server, /SECURE_CREDENTIAL_WRITE_FAILED/);
  assert.match(server, /ZOOM_CREDENTIAL_VALIDATION/);
  assert.match(server, /mapZoomCredentialSaveError/);
});
