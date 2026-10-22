#!/usr/bin/env node
/**
 * NEUD Zoom RTMS auth correction —
 * General App Public Client OAuth + PKCE (no Account ID / S2S / Client Secret).
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

test("ZOOM AUTH: no Account ID; Public Client ID schema", () => {
  const types = read("desktop/src/integrations/zoom/zoom-types.ts");
  assert.match(types, /zoom-rtms-general-oauth-pkce/);
  assert.doesNotMatch(types, /accountId:\s*string/);
  assert.match(types, /ZoomAppCredentials\s*=\s*\{[\s\S]*publicClientId/);
  assert.doesNotMatch(
    types,
    /ZoomAppCredentials\s*=\s*\{[\s\S]*clientSecret/,
  );

  const store = read("desktop/src/integrations/zoom/zoom-credential-store.ts");
  assert.match(store, /developmentPublicClientId|publicClientId/);
  assert.match(store, /if \(!activeId\)/);
  assert.doesNotMatch(store, /Account ID.*required|accountId\.trim\(\)/);
  assert.doesNotMatch(store, /Client Secret are required/);

  const client = read("src/components/live-chat/LiveChatClient.tsx");
  assert.doesNotMatch(client, /Account ID/);
  assert.doesNotMatch(client, /accountId/);
  assert.doesNotMatch(client, /Server-to-Server/);
});

test("ZOOM AUTH: token store + OAuth entry points (no Basic secret)", () => {
  assert.ok(
    fs.existsSync(
      path.join(repoRoot, "desktop/src/integrations/zoom/zoom-token-store.ts"),
    ),
  );
  const tokens = read("desktop/src/integrations/zoom/zoom-token-store.ts");
  assert.match(tokens, /zoom-oauth-tokens\.cred/);
  assert.match(tokens, /safeStorage/);
  assert.match(tokens, /refreshToken/);
  assert.match(tokens, /accessToken/);

  const service = read("desktop/src/integrations/zoom/zoom-integration-service.ts");
  assert.match(service, /startUserOAuth/);
  assert.match(service, /buildZoomAuthorizationCodeTokenBody/);
  assert.match(service, /codeChallenge|createCodeChallengeS256/);
  assert.match(service, /listen\(0,\s*["']127\.0\.0\.1["']/);
  assert.match(service, /buildZoomRefreshTokenBody/);
  assert.match(service, /disconnectUser/);
  assert.match(service, /publicClientId/);
  assert.doesNotMatch(service, /account_credentials/);
  assert.doesNotMatch(service, /searchParams\.set\(["']account_id["']/);
  assert.doesNotMatch(service, /Authorization:\s*`Basic/);
  assert.doesNotMatch(service, /clientSecret/);

  const pkce = read("desktop/src/integrations/zoom/zoom-pkce.ts");
  assert.match(pkce, /authorization_code/);
  assert.match(pkce, /code_challenge_method/);
  assert.match(pkce, /refresh_token/);
  assert.match(pkce, /publicClientId/);

  const api = read("desktop/src/services/local-api-server.ts");
  assert.match(api, /\/api\/integrations\/zoom\/oauth\/start/);
  assert.match(api, /\/api\/integrations\/zoom\/oauth\/disconnect/);
  assert.match(api, /\/api\/integrations\/zoom\/app-credentials/);
  assert.doesNotMatch(api, /body\.accountId/);
});

test("ZOOM AUTH: Live Chat operator UX + Developer Setup", () => {
  const client = read("src/components/live-chat/LiveChatClient.tsx");
  assert.match(client, /Connect Zoom/);
  assert.match(client, /Disconnect Zoom/);
  assert.match(client, /Connected as/);
  assert.match(client, /Developer Setup/);
  assert.match(client, /Save Zoom OAuth Settings|Save Public Client ID/);
  assert.match(client, /Public Client ID/);
  assert.doesNotMatch(client, /label=["']Client Secret["']/);
  assert.match(client, /No Client\s+Secret/);
  assert.match(client, /RTMS setup requirements/);
  assert.match(client, /localStartZoomOAuth/);
  assert.match(client, /Source Type/);
  assert.match(client, /Meeting ID|Webinar ID/);
  assert.match(client, /OAuth validation pending/);
  assert.match(client, /RTMS connection validation pending/);
  assert.match(client, /Live chat-message validation pending/);
});

test("ZOOM AUTH: friendly states + no secrets in packages", () => {
  const types = read("desktop/src/integrations/zoom/zoom-types.ts");
  assert.match(types, /Zoom is not connected/);
  assert.match(types, /Connecting to Zoom/);
  assert.match(types, /Zoom connected/);
  assert.match(types, /Zoom authentication expired/);
  assert.match(types, /Zoom Public Client ID required/);
  assert.match(types, /RTMS unavailable for this account/);
  assert.match(types, /Connection error/);

  const builder = read("desktop/src/packages/modular-package-builder.ts");
  assert.doesNotMatch(builder, /clientSecret|access_token|refresh_token|NEUD_ZOOM/);
  const liveChat = read("desktop/src/live-chat/live-chat-service.ts");
  assert.match(liveChat, /delete safeSettings/);
});

test("ZOOM AUTH: Manual provider untouched", () => {
  const registry = read("desktop/src/live-chat/providers/registry.ts");
  assert.match(registry, /manual:\s*\(\)\s*=>\s*new ManualLiveChatProvider/);
  assert.match(registry, /zoom:\s*\(\)\s*=>\s*new ZoomLiveChatProvider/);
  const manual = read("desktop/src/live-chat/providers/manual-provider.ts");
  assert.match(manual, /class ManualLiveChatProvider/);
});
