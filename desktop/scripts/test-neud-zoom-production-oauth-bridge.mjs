#!/usr/bin/env node
/**
 * Zoom Production HTTPS OAuth callback bridge + Development loopback.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import {
  getZoomOAuthRedirectUri,
  parseZoomOAuthDeepLink,
} from "./lib/zoom-oauth-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const bridgeMod = await import(
  pathToFileURL(path.join(repoRoot, "src/lib/zoom/oauth-bridge.ts")).href
);

test("ZOOM BRIDGE: Development uses ephemeral loopback redirect", () => {
  const uri = getZoomOAuthRedirectUri({
    mode: "development",
    loopbackPort: 52936,
  });
  assert.equal(uri, "http://127.0.0.1:52936/oauth/zoom/callback");
  const redirectSrc = read("desktop/src/integrations/zoom/zoom-oauth-redirect.ts");
  assert.match(redirectSrc, /getZoomOAuthRedirectUri/);
  assert.match(redirectSrc, /http:\/\/\$\{ZOOM_OAUTH_LOOPBACK_HOST\}:\$\{port\}/);
});

test("ZOOM BRIDGE: Production uses https://neud.io/oauth/zoom/callback", () => {
  assert.equal(
    getZoomOAuthRedirectUri({ mode: "production" }),
    "https://neud.io/oauth/zoom/callback",
  );
  const redirectSrc = read("desktop/src/integrations/zoom/zoom-oauth-redirect.ts");
  assert.match(redirectSrc, /ZOOM_OAUTH_PRODUCTION_ORIGIN = ["']https:\/\/neud\.io["']/);
  assert.match(redirectSrc, /ZOOM_OAUTH_PRODUCTION_REDIRECT_URI/);
  assert.match(redirectSrc, /ZOOM_OAUTH_CALLBACK_PATH/);
});

test("ZOOM BRIDGE: authorize and exchange share getZoomOAuthRedirectUri", () => {
  const service = read("desktop/src/integrations/zoom/zoom-integration-service.ts");
  assert.match(service, /getZoomOAuthRedirectUri/);
  assert.match(service, /redirectUri/);
  assert.match(service, /exchangeAuthorizationCode/);
  assert.match(service, /not neud:\/\//);
});

test("ZOOM BRIDGE: Production authorize uses Public Client ID + PKCE", () => {
  const service = read("desktop/src/integrations/zoom/zoom-integration-service.ts");
  assert.match(service, /buildZoomAuthorizeUrl/);
  assert.match(service, /createCodeChallengeS256/);
  assert.match(service, /codeChallenge/);
  assert.match(service, /getActivePublicClientId/);
  assert.doesNotMatch(service, /Authorization:\s*`Basic/);
  assert.doesNotMatch(service, /clientSecret/);
});

test("ZOOM BRIDGE: deep link accept / reject rules", () => {
  const ok = parseZoomOAuthDeepLink(
    "neud://oauth/zoom/callback?code=abc&state=xyz",
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.code, "abc");
  assert.equal(ok.state, "xyz");

  assert.equal(parseZoomOAuthDeepLink("https://evil.example/x").ok, false);
  assert.equal(parseZoomOAuthDeepLink("neud://other/path").ok, false);
  assert.equal(parseZoomOAuthDeepLink("neud://oauth/wrong").ok, false);

  const denied = parseZoomOAuthDeepLink(
    "neud://oauth/zoom/callback?error=access_denied&state=xyz",
  );
  assert.equal(denied.ok, true);
  assert.equal(denied.error, "access_denied");

  const deepSrc = read("desktop/src/integrations/zoom/zoom-deep-link.ts");
  assert.match(deepSrc, /invalid_scheme/);
  assert.match(deepSrc, /invalid_host_path/);
});

test("ZOOM BRIDGE: HTTPS page forwards only allow-listed fields", () => {
  const bridge = read("src/lib/zoom/oauth-bridge.ts");
  assert.match(bridge, /neud:\/\/oauth\/zoom\/callback/);
  assert.doesNotMatch(bridge, /code_verifier|client_secret/i);

  const page = read("src/app/(public)/oauth/zoom/callback/page.tsx");
  assert.match(page, /ZoomOAuthCallbackBridge/);
  const ui = read("src/components/zoom/ZoomOAuthCallbackBridge.tsx");
  assert.match(ui, /Connecting Zoom to NEUD/);
  assert.match(ui, /Opening NEUD/);
  assert.match(ui, /Return to NEUD/);
  assert.match(ui, /Open NEUD/);
  assert.match(ui, /Zoom Authorization Cancelled/);
  assert.match(ui, /Unable to Complete Authorization/);
  assert.doesNotMatch(ui, /Zoom connected successfully/);
  assert.doesNotMatch(ui, /Zoom Connected/);
  assert.match(ui, /history\.replaceState/);
  assert.doesNotMatch(ui, /\{deepLink\}|\{params\.code\}|\{params\.state\}/);
  assert.match(ui, /zoomBridgeLaunchLink/);
  assert.match(ui, /launchNeudDeepLink/);
  assert.doesNotMatch(ui, /location\.href\s*=/);
});

test("ZOOM BRIDGE: protocol registration + cold start handling", () => {
  const protocol = read("desktop/src/services/neud-protocol.ts");
  assert.match(protocol, /setAsDefaultProtocolClient/);
  assert.match(protocol, /queueOrDeliverProtocolUrl/);
  const main = read("desktop/src/main.ts");
  assert.match(main, /registerNeudProtocolClient/);
  assert.match(main, /handleProtocolCallback/);
  assert.match(main, /open-url/);
  assert.match(main, /second-instance/);
  assert.match(main, /extractNeudProtocolUrl/);
  const builder = read("desktop/electron-builder.yml");
  assert.match(builder, /protocols:/);
  assert.match(builder, /neud/);
});

test("ZOOM BRIDGE: service pending cleanup + deep link path", () => {
  const service = read("desktop/src/integrations/zoom/zoom-integration-service.ts");
  assert.match(service, /handleProtocolCallback/);
  assert.match(service, /completeOAuthCallback/);
  assert.match(service, /AUTH_TIMEOUT/);
  assert.match(service, /abortOAuthListener/);
  assert.match(service, /mode === ["']production["']/);
  assert.match(service, /mode === ["']development["']/);
});

test("ZOOM BRIDGE: dual Public Client ID configuration", () => {
  const store = read("desktop/src/integrations/zoom/zoom-credential-store.ts");
  assert.match(store, /developmentPublicClientId/);
  assert.match(store, /productionPublicClientId/);
  assert.match(store, /oauthMode/);
  assert.match(store, /NEUD_ZOOM_OAUTH_MODE/);
  const client = read("src/components/live-chat/LiveChatClient.tsx");
  assert.match(client, /Development Public Client ID/);
  assert.match(client, /Production Public Client ID/);
});

test("ZOOM BRIDGE: bridge module builds deep link without extra params", () => {
  const link = bridgeMod.buildNeudZoomDeepLink({
    code: "c1",
    state: "s1",
    error: null,
    errorDescription: null,
  });
  assert.equal(link, "neud://oauth/zoom/callback?code=c1&state=s1");
  assert.equal(
    bridgeMod.zoomBridgeOutcome({
      code: "c1",
      state: "s1",
      error: null,
      errorDescription: null,
    }),
    "received",
  );
  assert.equal(
    bridgeMod.zoomBridgeOutcome({
      code: null,
      state: "s1",
      error: "access_denied",
      errorDescription: null,
    }),
    "denied",
  );
  assert.equal(
    bridgeMod.zoomBridgeOutcome({
      code: null,
      state: null,
      error: null,
      errorDescription: null,
    }),
    "invalid",
  );
  assert.equal(
    bridgeMod.zoomBridgeOutcome({
      code: "only-code",
      state: null,
      error: null,
      errorDescription: null,
    }),
    "invalid",
  );
  assert.equal(
    bridgeMod.zoomBridgeOutcome({
      code: null,
      state: "only-state",
      error: null,
      errorDescription: null,
    }),
    "invalid",
  );
  assert.equal(
    bridgeMod.zoomBridgeLaunchLink({
      code: "c1",
      state: "s1",
      error: null,
      errorDescription: null,
    }),
    "neud://oauth/zoom/callback?code=c1&state=s1",
  );
  assert.equal(
    bridgeMod.zoomBridgeLaunchLink({
      code: null,
      state: "s1",
      error: "access_denied",
      errorDescription: "user cancelled",
    }),
    "neud://oauth/zoom/callback?state=s1&error=access_denied&error_description=user+cancelled",
  );
  assert.equal(
    bridgeMod.zoomBridgeLaunchLink({
      code: "only-code",
      state: null,
      error: null,
      errorDescription: null,
    }),
    null,
  );
  assert.equal(
    bridgeMod.zoomBridgeLaunchLink({
      code: null,
      state: null,
      error: null,
      errorDescription: null,
    }),
    null,
  );
  assert.equal(
    bridgeMod.zoomBridgeLaunchLink({
      code: "javascript:alert(1)",
      state: "https://evil.example",
      error: null,
      errorDescription: null,
    }).startsWith("neud://oauth/zoom/callback?"),
    true,
  );
  const hostile = bridgeMod.zoomBridgeLaunchLink({
    code: "code\nhttps://evil.example",
    state: "state",
    error: null,
    errorDescription: null,
  });
  assert.equal(hostile, null);
});
