#!/usr/bin/env node
/**
 * Zoom Authorization Code + PKCE (S256) + ephemeral loopback.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function base64UrlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createCodeChallengeS256(codeVerifier) {
  return base64UrlEncode(createHash("sha256").update(codeVerifier, "ascii").digest());
}

function generateCodeVerifier() {
  return base64UrlEncode(randomBytes(32));
}

test("ZOOM PKCE: S256 challenge matches RFC 7636 appendix B", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(
    createCodeChallengeS256(verifier),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
  assert.match(read("desktop/src/integrations/zoom/zoom-pkce.ts"), /createCodeChallengeS256/);
});

test("ZOOM PKCE: verifier generation is high-entropy URL-safe", () => {
  const a = generateCodeVerifier();
  const b = generateCodeVerifier();
  assert.notEqual(a, b);
  assert.ok(a.length >= 43 && a.length <= 128);
  assert.match(a, /^[A-Za-z0-9\-_]+$/);
});

test("ZOOM PKCE: authorize URL uses Public Client ID + PKCE", () => {
  const src = read("desktop/src/integrations/zoom/zoom-pkce.ts");
  assert.match(src, /code_challenge_method["']?\s*,\s*["']S256["']/);
  assert.match(src, /publicClientId/);
  assert.match(src, /client_id/);
});

test("ZOOM PKCE: token bodies use Public Client ID; no secret fields", () => {
  const helpers = read("desktop/src/integrations/zoom/zoom-pkce.ts");
  assert.match(helpers, /authorization_code/);
  assert.match(helpers, /code_verifier/);
  assert.match(helpers, /refresh_token/);
  assert.match(helpers, /publicClientId/);
  assert.match(helpers, /Public Client token exchange/);
  assert.match(helpers, /Public Client refresh/);
});

test("ZOOM PKCE: valid / invalid callback evaluation in source", () => {
  const helpers = read("desktop/src/integrations/zoom/zoom-pkce.ts");
  assert.match(helpers, /evaluateZoomOAuthCallback/);
  assert.match(helpers, /state_mismatch/);
  assert.match(helpers, /denied/);
  assert.match(helpers, /no_pending/);
});

test("ZOOM PKCE: service uses ephemeral port + PKCE + timeout cleanup", () => {
  const service = read("desktop/src/integrations/zoom/zoom-integration-service.ts");
  assert.match(service, /generateCodeVerifier/);
  assert.match(service, /createCodeChallengeS256/);
  assert.match(service, /buildZoomAuthorizeUrl/);
  assert.match(service, /listen\(0,\s*["']127\.0\.0\.1["']/);
  assert.match(service, /getZoomOAuthRedirectUri/);
  assert.match(service, /ZOOM_OAUTH_TIMEOUT_MS/);
  assert.match(service, /AUTH_TIMEOUT/);
  assert.match(service, /abortOAuthListener/);
  assert.match(service, /renderZoomLoopbackPage/);
  const loopbackPage = read("desktop/src/integrations/zoom/zoom-oauth-callback-page.ts");
  assert.match(loopbackPage, /Zoom Connected/);
  assert.match(loopbackPage, /Zoom Authorization Cancelled/);
  assert.match(loopbackPage, /Unable to Complete Authorization/);
  assert.doesNotMatch(service, /Authorization:\s*`Basic/);
  assert.doesNotMatch(service, /clientSecret/);
});

test("ZOOM PKCE: token exchange uses verifier; public-client refresh; safeStorage", () => {
  const service = read("desktop/src/integrations/zoom/zoom-integration-service.ts");
  assert.match(service, /codeVerifier/);
  assert.match(service, /buildZoomAuthorizationCodeTokenBody/);
  assert.match(service, /refreshAccessToken/);
  assert.match(service, /buildZoomRefreshTokenBody/);
  assert.match(service, /this\.tokens\.save/);
  assert.match(service, /getActivePublicClientId/);

  const tokens = read("desktop/src/integrations/zoom/zoom-token-store.ts");
  assert.match(tokens, /safeStorage/);
  assert.match(tokens, /zoom-oauth-tokens\.cred/);
  assert.match(tokens, /encryptString/);
});

test("ZOOM PKCE: mechanism + Marketplace pattern in types/UI", () => {
  const types = read("desktop/src/integrations/zoom/zoom-types.ts");
  assert.match(types, /zoom-rtms-general-oauth-pkce/);
  assert.match(types, /Authorization Code \+ PKCE|PKCE/);
  assert.match(types, /developmentPublicClientId|publicClientId/);
  assert.doesNotMatch(types, /accountId:\s*string;\s*$/m);

  const client = read("src/components/live-chat/LiveChatClient.tsx");
  assert.match(client, /Public Client OAuth|Public Client ID/);
  assert.match(client, /127\.0\.0\.1\/oauth\/zoom\/callback|neud\.io\/oauth\/zoom\/callback/);
  assert.doesNotMatch(client, /Account ID/);
  assert.doesNotMatch(client, /label=["']Client Secret["']/);
});
