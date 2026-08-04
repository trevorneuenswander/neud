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

test("hosted login uses full navigation to portal after sign-in", () => {
  const loginForm = read("src/components/auth/LoginForm.tsx");
  assert.match(loginForm, /nextPath = "\/portal"/);
  assert.match(loginForm, /window\.location\.assign\(nextPath\)/);
  assert.match(loginForm, /requiresDesktopMainSessionHandoff/);
  assert.match(loginForm, /router\.push\(nextPath\)/);
});

test("login page resolves safe hosted next destinations", () => {
  const loginPage = read("src/app/(public)/login/page.tsx");
  const hostedRedirect = read("src/lib/auth/hosted-redirect.ts");
  assert.match(loginPage, /getSafeHostedRedirectPath/);
  assert.match(loginPage, /redirectIfAuthenticated\(nextPath\)/);
  assert.match(hostedRedirect, /HOSTED_PORTAL_PREFIX/);
  assert.match(hostedRedirect, /\/view\//);
  assert.match(hostedRedirect, /isHostedDesktopOnlyPath/);
});

test("external and desktop-only redirects are rejected", () => {
  const hostedRedirect = read("src/lib/auth/hosted-redirect.ts");
  assert.match(hostedRedirect, /isInternalApplicationPath/);
  assert.match(hostedRedirect, /HOSTED_AUTH_ROUTES/);
  assert.doesNotMatch(hostedRedirect, /https:\/\//);
});

test("middleware guards portal and login without redirect loops", () => {
  const proxy = read("src/lib/supabase/proxy.ts");
  assert.match(proxy, /loginUrl\.pathname = "\/login"/);
  assert.match(proxy, /landingUrl\.pathname = DEFAULT_HOSTED_LANDING_PATH/);
  assert.match(proxy, /HOSTED_PORTAL_PREFIX/);
  assert.doesNotMatch(proxy, /pathname = "\/\?next=/);
});

test("unauthenticated portal routes redirect to login with next", () => {
  const proxy = read("src/lib/supabase/proxy.ts");
  assert.match(proxy, /!isAuthenticated && isProtectedPath/);
  assert.match(proxy, /searchParams\.set\(\s*"next"/);
});

test("authenticated auth routes redirect to hosted landing", () => {
  const proxy = read("src/lib/supabase/proxy.ts");
  const session = read("src/lib/auth/session.ts");
  assert.match(proxy, /isAuthenticated && isAuthRoute/);
  assert.match(session, /DEFAULT_REDIRECT/);
  assert.match(read("src/lib/routing/startup-paths.ts"), /DEFAULT_HOSTED_LANDING_PATH = "\/portal"/);
});

test("desktop login keeps client router navigation and desktop handoff helpers", () => {
  const loginForm = read("src/components/auth/LoginForm.tsx");
  const signIn = read("src/lib/auth/client-sign-in.ts");
  assert.match(loginForm, /requiresDesktopMainSessionHandoff/);
  assert.match(signIn, /requiresDesktopMainSessionHandoff/);
  assert.match(signIn, /storeVerifiedSession/);
});

test("preview hostnames are not hard-coded in redirect helpers", () => {
  const hostedRedirect = read("src/lib/auth/hosted-redirect.ts");
  const loginForm = read("src/components/auth/LoginForm.tsx");
  assert.doesNotMatch(hostedRedirect, /vercel\.app/);
  assert.doesNotMatch(loginForm, /vercel\.app/);
});
