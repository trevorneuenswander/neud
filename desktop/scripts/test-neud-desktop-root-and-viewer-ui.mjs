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

test("hosted root renders marketing homepage", () => {
  const rootPage = read("src/app/(public)/page.tsx");
  const marketing = read("src/components/marketing/MarketingHomePage.tsx");
  assert.match(rootPage, /shouldUseLocalData\(\)/);
  assert.match(rootPage, /MarketingHomePage/);
  assert.match(marketing, /Download Desktop/);
  assert.doesNotMatch(marketing, /DesktopLoginPage/);
});

test("electron root resolves login or authenticated landing server-side", () => {
  const rootPage = read("src/app/(public)/page.tsx");
  const desktopLogin = read("src/components/auth/DesktopLoginPage.tsx");
  assert.match(rootPage, /DesktopLoginPage/);
  assert.match(rootPage, /resolveLocalAuthenticatedPrincipal/);
  assert.match(rootPage, /resolveAuthenticatedLandingPath/);
  assert.doesNotMatch(desktopLogin, /\/download/);
  assert.doesNotMatch(desktopLogin, /Download/);
});

test("desktop login uses authenticated landing path with explicit desktop handoff guard", () => {
  const desktopLogin = read("src/components/auth/DesktopLoginPage.tsx");
  const loginForm = read("src/components/auth/LoginForm.tsx");
  const handoff = read("src/lib/auth/desktop-session-handoff.ts");
  assert.match(desktopLogin, /getDefaultAuthenticatedPath/);
  assert.match(loginForm, /requiresDesktopMainSessionHandoff/);
  assert.match(handoff, /isDesktopRuntimeClient\(\) \|\| isDesktopEnvironment\(\)/);
});

test("display cards use online viewer switch and view online button", () => {
  const toggle = read("src/components/displays/OnlineViewerToggle.tsx");
  const viewOnline = read("src/components/displays/ViewOnlineButton.tsx");
  const hook = read("src/lib/displays/use-online-viewer-settings.ts");
  const broadArrow = read("src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx");
  const htmlCard = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  const displayCard = read("src/components/displays/DisplayCard.tsx");

  assert.match(toggle, /Switch/);
  assert.match(broadArrow, /label="Online Viewer"/);
  assert.match(viewOnline, /View Online/);
  assert.match(viewOnline, /openExternalUrl/);
  assert.match(hook, /onlineViewerEnabled/);
  assert.match(hook, /setEnabled\(previousEnabled\)/);

  for (const source of [broadArrow, htmlCard, displayCard]) {
    assert.match(source, /OnlineViewerToggle/);
    assert.match(source, /ViewOnlineButton/);
    assert.doesNotMatch(source, /OnlineViewerCompactStatus/);
    assert.doesNotMatch(source, />\s*Manage\s*<\/Button>/);
  }
});

test("view online opens externally through desktop bridge", () => {
  const openExternal = read("src/lib/desktop/open-external-url.ts");
  const preload = read("desktop/src/preload.ts");
  const ipc = read("desktop/src/ipc/app.ts");
  assert.match(openExternal, /openExternal/);
  assert.match(preload, /neud:app:openExternal/);
  assert.match(ipc, /shell\.openExternal/);
});

test("view online uses canonical hosted fullscreen viewer url builder", () => {
  const viewerUrl = read("src/lib/hosted/viewer-url.ts");
  const viewOnline = read("src/components/displays/ViewOnlineButton.tsx");
  assert.match(viewerUrl, /getPublicDisplayFullscreenPath/);
  assert.match(viewerUrl, /getPrivateDisplayFullscreenPath/);
  assert.match(viewOnline, /buildAbsoluteHostedFullscreenViewerUrl/);
  assert.match(viewOnline, /disabled={disabled}/);
});

test("display edit page removed online viewer enable toggle", () => {
  const panel = read("src/components/displays/OnlineViewerPanel.tsx");
  assert.doesNotMatch(panel, /Enable Online Viewer/);
  assert.match(panel, /Turn Online Viewer on or[\s\S]*?off from the Displays page/);
  assert.doesNotMatch(panel, /Online viewing status/);
  assert.doesNotMatch(panel, /Viewer access mode/);
  assert.match(panel, /Private — Only users with access/);
  assert.match(panel, /Copy Link/);
  assert.match(panel, /Open Viewer/);
  assert.match(panel, /Sync Now/);
});

test("online viewer manage button component removed", () => {
  assert.throws(
    () => read("src/components/displays/OnlineViewerCompactStatus.tsx"),
    /ENOENT/,
  );
});

test("online viewer toggle persists through local api only", () => {
  const hook = read("src/lib/displays/use-online-viewer-settings.ts");
  const api = read("src/lib/local/online-viewer-api.ts");
  assert.match(hook, /localUpdateOnlineViewerSettings/);
  assert.match(api, /onlineViewerEnabled/);
  assert.doesNotMatch(hook, /localSetDeveloperDisplayEnabled/);
  assert.doesNotMatch(hook, /localSetDisplayEnabled/);
});
