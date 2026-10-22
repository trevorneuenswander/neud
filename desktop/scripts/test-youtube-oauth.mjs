#!/usr/bin/env node
/**
 * YouTube OAuth recovery. No Google network calls.
 * Browser abandonment is not detectable, so timeout and a second Connect are the cleanup paths.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "http";
import path from "path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "..");

function importSrc(relativePath) {
  return import(pathToFileURL(path.join(desktopRoot, relativePath)).href);
}

function read(relativePath) {
  return import("node:fs").then((fs) =>
    fs.readFileSync(path.join(repoRoot, relativePath), "utf8"),
  );
}

function redirectPort(authorizeUrl) {
  const redirect = new URL(authorizeUrl).searchParams.get("redirect_uri");
  return Number(new URL(redirect).port);
}

function portAccepts(port) {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/`, (response) => {
      response.resume();
      resolve(true);
    });
    request.on("error", () => resolve(false));
  });
}

function createFlow(oauth, options = {}) {
  const urls = [];
  const failures = [];
  const successes = [];
  const exchanges = [];
  const flow = new oauth.YouTubeOAuthFlow({
    timeoutMs: options.timeoutMs ?? 5_000,
    openExternal: async (url) => {
      urls.push(url);
    },
    exchangeCode: async (input) => {
      exchanges.push(input);
      assert.equal(typeof input.codeVerifier, "string");
      assert.equal(input.codeVerifier.length > 20, true);
      const authorizeRedirect = new URL(urls.at(-1)).searchParams.get("redirect_uri");
      assert.equal(input.redirectUri, authorizeRedirect);
      if (options.exchangeImpl) return options.exchangeImpl(input);
      if (options.exchangeError) throw options.exchangeError;
      return {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAtMs: Date.now() + 3_600_000,
      };
    },
    readChannelTitle: async () => "Ada",
    readClient: () => ({ clientId: "public-client", refreshToken: null }),
    persistSuccess: (tokens, connectedAs) => {
      successes.push({ hasRefresh: Boolean(tokens.refreshToken), connectedAs });
    },
    persistFailure: (outcome) => {
      failures.push(outcome);
    },
  });
  return { flow, urls, failures, successes, exchanges };
}

function callbackUrl(authorizeUrl, query) {
  const redirect = new URL(new URL(authorizeUrl).searchParams.get("redirect_uri"));
  const target = new URL(redirect);
  for (const [key, value] of Object.entries(query)) {
    target.searchParams.set(key, value);
  }
  return target;
}

async function finishCallback(authorizeUrl, query) {
  const response = await fetch(callbackUrl(authorizeUrl, query));
  const html = await response.text();
  assert.equal(response.status, 200);
  return html;
}

test("YouTube OAuth succeeds once and closes the listener", async () => {
  const oauth = await importSrc("src/integrations/youtube/youtube-oauth-flow.ts");
  const { flow, urls, successes, failures } = createFlow(oauth);
  const status = await flow.start();
  assert.equal(status.phase, "pending");
  assert.equal(status.listenerCount, 1);
  assert.match(urls[0], /code_challenge_method=S256/);
  assert.match(urls[0], /youtube\.readonly/);
  assert.equal(urls[0].includes("code_verifier"), false);
  assert.equal(urls[0].includes("client_secret"), false);
  assert.equal(urls[0].includes("include_granted_scopes"), false);
  const redirect = new URL(urls[0]).searchParams.get("redirect_uri");
  assert.equal(new URL(redirect).pathname, "/");
  assert.equal(redirect.includes("/oauth/"), false);
  const state = new URL(urls[0]).searchParams.get("state");
  const html = await finishCallback(urls[0], { code: "auth-code", state });
  assert.match(html, /YouTube Connected/);
  assert.match(html, /Your YouTube account has been successfully authorized/);
  assert.match(html, /You can return to NEUD/);
  assert.match(html, /You can safely close this window and return to NEUD/);
  assert.match(html, /window\.close/);
  await flow.whenSettled();
  assert.equal(flow.snapshot().phase, "idle");
  assert.equal(flow.snapshot().listenerCount, 0);
  assert.equal(successes.length, 1);
  assert.equal(successes[0].connectedAs, "Ada");
  assert.equal(failures.length, 0);
  assert.equal(await portAccepts(redirectPort(urls[0])), false);
});

test("abandoned YouTube OAuth times out and can be started again", async () => {
  const oauth = await importSrc("src/integrations/youtube/youtube-oauth-flow.ts");
  const { flow, urls, failures } = createFlow(oauth, { timeoutMs: 40 });
  await flow.start();
  const port = redirectPort(urls[0]);
  await flow.whenSettled();
  assert.equal(flow.snapshot().phase, "timed_out");
  assert.equal(flow.snapshot().message, "YouTube authorization timed out.");
  assert.equal(flow.snapshot().listenerCount, 0);
  assert.equal(failures[0].phase, "timed_out");
  assert.equal(await portAccepts(port), false);

  const again = await flow.start();
  assert.equal(again.phase, "pending");
  assert.equal(again.listenerCount, 1);
  assert.equal(urls.length, 2);
  flow.shutdown();
});

test("a second Connect cancels the pending listener and opens one new attempt", async () => {
  const oauth = await importSrc("src/integrations/youtube/youtube-oauth-flow.ts");
  const { flow, urls, failures } = createFlow(oauth);
  await flow.start();
  const firstPort = redirectPort(urls[0]);
  const restarted = await flow.start();
  assert.equal(restarted.phase, "pending");
  assert.equal(restarted.listenerCount, 1);
  assert.equal(urls.length, 2);
  assert.equal(await portAccepts(firstPort), false);
  assert.equal(await portAccepts(redirectPort(urls[1])), true);
  assert.equal(failures.length, 0);
  flow.shutdown();
  await flow.whenSettled();
  assert.equal(flow.snapshot().listenerCount, 0);
});

test("YouTube denial and token exchange failure clear the listener", async () => {
  const oauth = await importSrc("src/integrations/youtube/youtube-oauth-flow.ts");
  const helpers = await importSrc("src/integrations/youtube/youtube-oauth.ts");
  const denied = createFlow(oauth);
  await denied.flow.start();
  const deniedHtml = await finishCallback(denied.urls[0], { error: "access_denied", state: "ignored" });
  assert.match(deniedHtml, /Authorization Cancelled/);
  assert.match(deniedHtml, /Your YouTube account was not connected/);
  assert.equal(deniedHtml.includes("YouTube Connected"), false);
  await denied.flow.whenSettled();
  assert.equal(denied.flow.snapshot().phase, "denied");
  assert.equal(denied.flow.snapshot().message, "YouTube authorization was denied.");
  assert.equal(denied.flow.snapshot().listenerCount, 0);
  assert.equal(denied.successes.length, 0);

  const exchanged = createFlow(oauth, {
    exchangeError: new helpers.YouTubeOAuthFlowError(
      "invalid_client",
      "Google did not accept the OAuth client ID (invalid_client).",
      "invalid_client",
    ),
  });
  await exchanged.flow.start();
  const state = new URL(exchanged.urls[0]).searchParams.get("state");
  const failedHtml = await finishCallback(exchanged.urls[0], { code: "auth-code", state });
  assert.match(failedHtml, /YouTube Connection Failed/);
  assert.match(failedHtml, /invalid_client/);
  assert.equal(failedHtml.includes("YouTube Connected"), false);
  assert.equal(failedHtml.includes("window.close"), false);
  await exchanged.flow.whenSettled();
  assert.equal(exchanged.flow.snapshot().phase, "exchange_failed");
  assert.match(exchanged.flow.snapshot().message, /invalid_client/);
  assert.equal(exchanged.flow.snapshot().listenerCount, 0);
  assert.equal(exchanged.successes.length, 0);
  assert.equal(await portAccepts(redirectPort(exchanged.urls[0])), false);
});

test("cancel and shutdown close the only YouTube listener", async () => {
  const oauth = await importSrc("src/integrations/youtube/youtube-oauth-flow.ts");
  const { flow, urls, failures } = createFlow(oauth);
  await flow.start();
  const port = redirectPort(urls[0]);
  const cancelled = flow.cancel();
  assert.equal(cancelled.phase, "cancelled");
  assert.equal(cancelled.message, "YouTube authorization was cancelled.");
  assert.equal(cancelled.listenerCount, 0);
  assert.equal(failures[0].phase, "cancelled");
  await flow.whenSettled();
  assert.equal(await portAccepts(port), false);

  await flow.start();
  const shutdownPort = redirectPort(urls[1]);
  flow.shutdown();
  assert.equal(flow.snapshot().phase, "idle");
  assert.equal(flow.snapshot().listenerCount, 0);
  await flow.whenSettled();
  assert.equal(await portAccepts(shutdownPort), false);
});

test("YouTube OAuth service no longer blocks a second Connect", async () => {
  const fs = await import("node:fs");
  const service = fs.readFileSync(
    path.join(desktopRoot, "src/integrations/youtube/youtube-integration-service.ts"),
    "utf8",
  );
  const main = fs.readFileSync(path.join(desktopRoot, "src/main.ts"), "utf8");
  const api = fs.readFileSync(
    path.join(desktopRoot, "src/services/local-api-server.ts"),
    "utf8",
  );
  const ui = fs.readFileSync(
    path.join(repoRoot, "src/components/live-chat/LiveChatClient.tsx"),
    "utf8",
  );
  assert.doesNotMatch(service, /already in progress/);
  assert.match(service, /oauthFlow\.start/);
  assert.match(service, /cancelUserOAuth/);
  assert.match(service, /dispose\(\)/);
  assert.match(main, /youtubeIntegrationService\?\.dispose\(\)/);
  assert.match(api, /oauth\/cancel/);
  assert.match(ui, /Cancel/);
  assert.match(ui, /Restart YouTube authorization/);
  const flow = await read("desktop/src/integrations/youtube/youtube-oauth-flow.ts");
  assert.doesNotMatch(flow, /console\.(log|info|debug)/);
  const loopback = await read("desktop/src/integrations/youtube/youtube-oauth.ts");
  assert.match(loopback, /YOUTUBE_OAUTH_TIMEOUT_MS = 5 \* 60 \* 1000/);
  assert.doesNotMatch(loopback, /console\.(log|info|debug)/);
  assert.doesNotMatch(loopback, /Use a Google Desktop OAuth client/);
  assert.doesNotMatch(loopback, /body\.delete\("client_secret"\)/);
  assert.match(service, /clientSecretConfigured/);
  assert.match(service, /clientSecret: current\.clientSecret/);
  assert.match(ui, /OAuth client secret/);
  assert.match(ui, /type="password"/);
});

function googleErrorFetch(status, payload, expectSecret = false) {
  return async (url, init) => {
    assert.equal(url, "https://oauth2.googleapis.com/token");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["Content-Type"], "application/x-www-form-urlencoded");
    const sent = new URLSearchParams(init.body);
    assert.equal(sent.has("client_secret"), expectSecret);
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

test("YouTube token exchange posts PKCE fields and the saved client secret", async () => {
  const helpers = await importSrc("src/integrations/youtube/youtube-oauth.ts");
  const pkce = helpers.createYouTubePkce();
  const expected = crypto.createHash("sha256").update(pkce.verifier).digest("base64url");
  assert.equal(pkce.challenge, expected);
  let seen = null;
  const tokens = await helpers.exchangeYouTubeAuthorizationCode({
    clientId: "desktop-client.apps.googleusercontent.com",
    clientSecret: "desktop-client-secret",
    code: "auth+code",
    codeVerifier: pkce.verifier,
    redirectUri: "http://127.0.0.1:54321",
    fetchImpl: async (url, init) => {
      seen = { url, body: init.body, contentType: init.headers["Content-Type"] };
      return new Response(
        JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  assert.equal(tokens.accessToken, "access");
  assert.equal(tokens.refreshToken, "refresh");
  assert.equal(seen.url, helpers.YOUTUBE_OAUTH_TOKEN_URL);
  assert.equal(seen.contentType, "application/x-www-form-urlencoded");
  const sent = new URLSearchParams(seen.body);
  assert.equal(sent.get("client_id"), "desktop-client.apps.googleusercontent.com");
  assert.equal(sent.get("code"), "auth+code");
  assert.equal(sent.get("code_verifier"), pkce.verifier);
  assert.equal(sent.get("redirect_uri"), "http://127.0.0.1:54321");
  assert.equal(sent.get("grant_type"), "authorization_code");
  assert.equal(sent.get("client_secret"), "desktop-client-secret");

  let omitted = null;
  await helpers.exchangeYouTubeAuthorizationCode({
    clientId: "desktop-client.apps.googleusercontent.com",
    code: "auth+code",
    codeVerifier: pkce.verifier,
    redirectUri: "http://127.0.0.1:54321",
    fetchImpl: async (_url, init) => {
      omitted = init.body;
      return new Response(JSON.stringify({ access_token: "access", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal(new URLSearchParams(omitted).has("client_secret"), false);
});

test("Google token errors stay distinct and omit secrets", async () => {
  const helpers = await importSrc("src/integrations/youtube/youtube-oauth.ts");
  const cases = [
    {
      name: "invalid_client",
      status: 401,
      body: { error: "invalid_client", error_description: "The OAuth client was not found." },
      code: "invalid_client",
      message: /invalid_client/,
    },
    {
      name: "redirect_uri_mismatch",
      status: 400,
      body: { error: "redirect_uri_mismatch", error_description: "Bad redirect" },
      code: "redirect_mismatch",
      message: /redirect_uri_mismatch/,
    },
    {
      name: "pkce",
      status: 400,
      body: { error: "invalid_grant", error_description: "Invalid code verifier." },
      code: "pkce_mismatch",
      message: /sign-in check did not match/,
    },
    {
      name: "reused",
      status: 400,
      body: { error: "invalid_grant", error_description: "Code was already redeemed." },
      code: "code_reused",
      message: /expired or was already used/,
    },
    {
      name: "invalid_request",
      status: 400,
      body: { error: "invalid_request", error_description: "client_secret is missing." },
      code: "exchange_failed",
      message: /invalid_request.*client_secret is missing\. HTTP 400\./,
    },
  ];
  for (const item of cases) {
    await assert.rejects(
      () =>
        helpers.exchangeYouTubeAuthorizationCode({
          clientId: "desktop-client",
          code: "once",
          codeVerifier: "verifier-value",
          redirectUri: "http://127.0.0.1:9",
          fetchImpl: googleErrorFetch(item.status, item.body),
        }),
      (error) => {
        assert.equal(error.code, item.code);
        assert.match(error.message, item.message);
        assert.equal(error.message.includes("verifier-value"), false);
        assert.equal(error.message.includes("once"), false);
        return true;
      },
    );
  }

  await assert.rejects(
    () =>
      helpers.exchangeYouTubeAuthorizationCode({
        clientId: "desktop-client",
        code: "once",
        codeVerifier: "verifier-value",
        redirectUri: "http://127.0.0.1:9",
        fetchImpl: async () => {
          throw new TypeError("network down");
        },
      }),
    (error) => {
      assert.equal(error.code, "network");
      assert.match(error.message, /could not reach Google/);
      assert.equal(error.message.includes("network down"), false);
      return true;
    },
  );

  await assert.rejects(
    () =>
      helpers.refreshYouTubeAccessToken({
        clientId: "desktop-client",
        clientSecret: "desktop-client-secret",
        refreshToken: "refresh-secret",
        fetchImpl: googleErrorFetch(
          400,
          {
            error: "invalid_grant",
            error_description: "Token has been expired or revoked.",
          },
          true,
        ),
      }),
    (error) => {
      assert.equal(error.code, "revoked");
      assert.equal(error.message.includes("refresh-secret"), false);
      assert.equal(error.message.includes("desktop-client-secret"), false);
      return true;
    },
  );
});

test("Google invalid_request client_secret is missing is reported without secrets", async () => {
  const helpers = await importSrc("src/integrations/youtube/youtube-oauth.ts");
  const secret = "desktop-client-secret";
  const code = "4/probe-authorization-code";
  const verifier = "verifier-value-that-must-stay-hidden";
  await assert.rejects(
    () =>
      helpers.exchangeYouTubeAuthorizationCode({
        clientId: "desktop-client.apps.googleusercontent.com",
        clientSecret: secret,
        code,
        codeVerifier: verifier,
        redirectUri: "http://127.0.0.1:54321",
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: "invalid_request",
              error_description: `client_secret is missing. echoed ${secret} code ${code}`,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          ),
      }),
    (error) => {
      assert.equal(error.code, "exchange_failed");
      assert.equal(error.googleError, "invalid_request");
      assert.equal(error.httpStatus, 400);
      assert.match(error.googleErrorDescription, /client_secret is missing/);
      assert.equal(error.googleErrorDescription.includes(secret), false);
      assert.equal(error.googleErrorDescription.includes(code), false);
      assert.equal(error.googleErrorDescription.includes(verifier), false);
      assert.match(error.message, /HTTP 400/);
      assert.equal(error.diagnostic.oauthClientType, null);
      assert.equal(error.diagnostic.redirectUri, "http://127.0.0.1:54321");
      assert.equal(error.diagnostic.tokenEndpoint, helpers.YOUTUBE_OAUTH_TOKEN_URL);
      assert.equal(error.diagnostic.pkceMethod, "S256");
      assert.equal(error.diagnostic.parameterNames.includes("client_secret"), true);
      assert.equal(error.diagnostic.parameterNames.includes("code_verifier"), true);
      assert.equal(error.diagnostic.parameterNames.includes("grant_type"), true);
      const serialized = JSON.stringify(error.diagnostic);
      assert.equal(serialized.includes(secret), false);
      assert.equal(serialized.includes(code), false);
      assert.equal(serialized.includes(verifier), false);
      assert.equal(serialized.includes("desktop-client.apps.googleusercontent.com"), false);
      return true;
    },
  );
});

test("callback page waits for a saved token and a retry can succeed", async () => {
  const oauth = await importSrc("src/integrations/youtube/youtube-oauth-flow.ts");
  const page = await importSrc("src/integrations/youtube/youtube-oauth-callback-page.ts");
  const failed = page.renderYouTubeCallbackPage({
    kind: "failed",
    message: "Google did not accept the OAuth client ID (invalid_client).",
  });
  assert.match(failed, /YouTube Connection Failed/);
  assert.equal(failed.includes("YouTube Connected"), false);
  const cancelled = page.renderYouTubeCallbackPage({ kind: "cancelled" });
  assert.match(cancelled, /Authorization Cancelled/);
  assert.match(cancelled, /Your YouTube account was not connected/);
  const escaped = page.renderYouTubeCallbackPage({
    kind: "failed",
    message: "<script>alert(1)</script>",
  });
  assert.equal(escaped.includes("<script>alert"), false);
  assert.match(escaped, /&lt;script&gt;/);

  let release = null;
  let attempts = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const pending = createFlow(oauth, {
    exchangeImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        await gate;
        throw new Error("YouTube token exchange failed.");
      }
      return {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAtMs: Date.now() + 3_600_000,
      };
    },
  });
  await pending.flow.start();
  const state = new URL(pending.urls[0]).searchParams.get("state");
  let finished = false;
  const htmlPromise = finishCallback(pending.urls[0], { code: "auth-code", state }).then((html) => {
    finished = true;
    return html;
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(finished, false);
  assert.equal(pending.successes.length, 0);
  release();
  const html = await htmlPromise;
  assert.match(html, /YouTube Connection Failed/);
  assert.equal(html.includes(">YouTube Connected<"), false);
  await pending.flow.whenSettled();
  assert.equal(pending.exchanges.length, 1);
  assert.equal(pending.flow.snapshot().phase, "exchange_failed");

  await pending.flow.start();
  const nextState = new URL(pending.urls[1]).searchParams.get("state");
  const raw = `http://127.0.0.1:${redirectPort(pending.urls[1])}/?code=ab+cd%2Fef&state=${encodeURIComponent(nextState)}`;
  const successResponse = await fetch(raw);
  const successHtml = await successResponse.text();
  await pending.flow.whenSettled();
  assert.equal(pending.exchanges.length, 2);
  assert.equal(pending.exchanges[1].code, "ab+cd/ef");
  assert.match(successHtml, /YouTube Connected/);
  assert.equal(pending.successes.length, 1);
  assert.equal(pending.flow.snapshot().phase, "idle");
});

test("a second callback does not exchange the authorization code twice", async () => {
  const oauth = await importSrc("src/integrations/youtube/youtube-oauth-flow.ts");
  let release = null;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { flow, urls, exchanges } = createFlow(oauth, {
    exchangeImpl: async () => {
      await gate;
      return {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAtMs: Date.now() + 3_600_000,
      };
    },
  });
  await flow.start();
  const state = new URL(urls[0]).searchParams.get("state");
  const target = callbackUrl(urls[0], { code: "once", state });
  const first = fetch(target);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(exchanges.length, 1);
  const second = fetch(target);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(exchanges.length, 1);
  release();
  const [firstResponse, secondResponse] = await Promise.all([first, second]);
  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  assert.match(await firstResponse.text(), /YouTube Connected/);
  assert.match(await secondResponse.text(), /YouTube Connected/);
  await flow.whenSettled();
  assert.equal(exchanges.length, 1);
});
