#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createStreamBidPhotoSession } from "../src/displays/stream-bid-photo-session.ts";
import { manualBidInputFromCanonical } from "../../src/lib/bag/manual-bid-input.ts";
import { shouldApplyDisplayPayload } from "../../src/lib/displays/display-payload-order.ts";
import { resolveSessionFacingEngineLastError } from "../src/services/engine-session-facing-errors.ts";
import { isCompleteMacChromeApp } from "../../workers/data-engine/src/browser/resolve-puppeteer-browser.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("older display revision and older fetch cannot overwrite a newer lot payload", () => {
  assert.equal(
    shouldApplyDisplayPayload({
      fetchRequestId: "2",
      latestAppliedFetchRequestId: "4",
      revision: 8,
      latestRevision: 9,
    }),
    false,
  );
  assert.equal(
    shouldApplyDisplayPayload({
      fetchRequestId: "5",
      latestAppliedFetchRequestId: "4",
      revision: 10,
      latestRevision: 9,
    }),
    true,
  );
});

test("stale photo callback cannot restore the previous lot", () => {
  const session = createStreamBidPhotoSession();
  session.beginLot();
  const previous = session.beginTransition();
  session.beginLot();
  const current = session.beginTransition();
  assert.equal(session.isCurrent(previous), false);
  assert.equal(session.isCurrent(current), true);
});

test("slideshow timer resets exactly once when the lot changes", () => {
  const session = createStreamBidPhotoSession();
  session.beginLot();
  session.beginLot();
  assert.equal(session.timerResetCount(), 1);
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const setPhotos = html.slice(html.indexOf("function setPhotos"), html.indexOf("function parseCurrencyRow"));
  assert.equal((setPhotos.match(/photoSessionGeneration \+= 1/g) ?? []).length, 1);
  assert.match(setPhotos, /clearInterval\(photoCycleTimer\)/);
  assert.match(html, /function photoCallbackIsCurrent/);
});

test("successful browser recovery is not the current red error", () => {
  assert.equal(
    resolveSessionFacingEngineLastError({
      actualState: "running",
      healthState: "healthy",
      lastError: "Failed to launch the browser process: dlopen",
    }),
    null,
  );
  assert.equal(
    resolveSessionFacingEngineLastError({
      actualState: "error",
      healthState: "error",
      lastError: "Failed to launch the browser process: dlopen",
    }),
    "Failed to launch the browser process: dlopen",
  );
});

test("recovered launch remains in runtime history and genuine failure stays current", () => {
  const runtime = read("workers/data-engine/src/engine-runtime.js");
  assert.match(runtime, /browser\.launch\.recovered/);
  assert.match(runtime, /last_error: null/);
  assert.match(runtime, /last_error: failureMessage/);
});

test("empty manual bid submit and Clear both clear the canonical bid", () => {
  const routes = read("desktop/src/bag/live-state/bag-live-state-routes.ts");
  const controller = read("desktop/src/bag/live-state/bag-local-controller-service.ts");
  const ui = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(routes, /typeof body\.bid !== "string"/);
  assert.match(routes, /Manual bid cleared/);
  assert.match(controller, /if \(!bidInput\.trim\(\)\) \{\s*return this\.clearDraftBid/);
  assert.match(controller, /return this\.clearSubmittedBid/);
  assert.match(ui, /aria-label="Clear manual bid"/);
  assert.match(ui, /localSetBagManualBid\(projectId, ""\)/);
  const bidNorm = read("desktop/src/displays/display-bid-normalization.ts");
  assert.match(bidNorm, /"\$0"/);
  assert.match(bidNorm, /return DISPLAY_NO_BID_LABEL/);
  assert.match(read("desktop/src/displays/resolve-local-controller-display-data.ts"), /not replaced by the scraped bid/);
});

test("collapsed sidebar has no N and expanded branding stays", () => {
  const branding = read("src/components/portal/SidebarBranding.tsx");
  const collapsed = branding.slice(
    branding.indexOf("function CollapsedSidebarOpenControl"),
    branding.indexOf("function ExpandedSidebarCloseControl"),
  );
  assert.doesNotMatch(collapsed, />\s*N\s*</);
  assert.match(collapsed, /aria-label="Open sidebar"/);
  assert.match(collapsed, /SidebarPanelLeftIcon/);
  assert.match(branding, /sidebar-brand-name/);
  assert.match(branding, /AppVersion placement="sidebar"/);
});

test("successful clear resets the manual bid field and a null refresh stays empty", () => {
  const format = (amount) => `$${amount.toLocaleString("en-US")}`;
  assert.equal(
    manualBidInputFromCanonical({
      bidDirty: false,
      draftLabel: "$25,000",
      submittedAmount: null,
      formatSubmitted: format,
    }),
    "",
  );
  assert.equal(
    manualBidInputFromCanonical({
      bidDirty: true,
      draftLabel: "$30,000",
      submittedAmount: null,
      formatSubmitted: format,
    }),
    "$30,000",
  );
  assert.equal(
    manualBidInputFromCanonical({
      bidDirty: false,
      draftLabel: "",
      submittedAmount: 0,
      formatSubmitted: format,
    }),
    "",
  );
  const client = read("src/components/bag-graphics/BagControllerClient.tsx");
  const success = client.slice(client.indexOf('label === "Manual bid"'), client.indexOf("async function handleExportOffline"));
  assert.match(success, /bidDraftFromEnvelope\(next\)/);
  assert.match(success, /setDraftValues\(\(current\) => \(\{ \.\.\.current, bid: nextBid \}\)\)/);
  assert.match(client, /aria-label="Clear manual bid"/);
  assert.match(client, /localSetBagManualBid\(projectId, ""\)/);
});

test("sign out stops every local engine before auth teardown", () => {
  const main = read("desktop/src/main.ts");
  const manager = read("desktop/src/services/engine-manager.ts");
  const logout = read("src/lib/auth/force-local-sign-out.ts");
  const signOut = main.slice(main.indexOf("forceSignOutFromMain = async"));
  const stopAt = signOut.indexOf("stopAllForSignOut");
  const clearAt = signOut.indexOf("authLicenseManager.clear");
  assert.ok(stopAt >= 0 && clearAt > stopAt);
  assert.match(manager, /async stopAllForSignOut/);
  assert.match(manager, /listLocalEngineIds/);
  assert.match(manager, /reason: "user-signed-out"/);
  assert.match(manager, /gracefulMs: 2000/);
  assert.match(manager, /forceMs: 1500/);
  assert.match(manager, /Scraper stopped — user signed out/);
  assert.match(manager, /if \(this\.signOutShutdown\)/);
  assert.match(logout, /IPC_FORCE_SIGN_OUT_TIMEOUT_MS = 12_000/);
  assert.match(read("desktop/src/services/local-data-service.ts"), /listLocalEngineIds/);
});

test("sign out warns when an engine is running and cancel leaves it running", () => {
  const dialog = read("src/components/portal/NeudAppDialogHost.tsx");
  const logout = read("src/lib/auth/force-local-sign-out.ts");
  assert.match(dialog, /Scraper is running/);
  assert.match(dialog, /Stop Scraper and Sign Out/);
  assert.match(dialog, />\s*Cancel\s*</);
  assert.match(dialog, /kind: "sign-out"/);
  assert.match(logout, /isSessionActive/);
  assert.match(logout, /neud-sign-out-confirm/);
  assert.match(read("desktop/src/ipc/engines.ts"), /isSessionActive/);
});

test("associated projects use the project team, not the user profile team", () => {
  const service = read("desktop/src/services/access-management-service.ts");
  const summary = service.slice(
    service.indexOf("function summarizeProjectAccess"),
    service.indexOf("function pathToProjectRole"),
  );
  assert.match(summary, /getTeamIdsForProject\(projectId\)/);
  assert.doesNotMatch(summary, /path\.teamName/);
  assert.match(summary, /Unassigned/);
  assert.match(service, /ensureFromCloud/);
});

test("activity tables widen project, user, and date while description stays flexible", () => {
  const full = read("src/components/activity/ActivityTable.tsx");
  const compact = read("src/components/activity/CompactActivityTable.tsx");
  for (const table of [full, compact]) {
    assert.match(table, /min-w-48/);
    assert.match(table, /min-w-40/);
    assert.match(table, /whitespace-nowrap/);
    assert.match(table, /table-fixed/);
  }
});

test("fresh install applies cloud display enabled state and order", () => {
  const pull = read("desktop/src/services/display-sync/display-sync-pull.ts");
  const repo = read("desktop/src/repositories/displays-repository.ts");
  assert.match(pull, /applyRemoteConfiguration/);
  assert.match(pull, /hasPendingOperation\(displayId, "display.update"\)/);
  assert.match(repo, /applyRemoteConfiguration/);
  assert.match(repo, /sort_order/);
});

test("stream bid local URL does not force a transparent page background", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /stream-bid-display/);
  assert.match(templates, /outputPaintsOwnBackground/);
  const ticker = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(ticker, /background:\s*transparent/);
});

test("incomplete macOS Chrome bundle is not treated as launchable", () => {
  if (process.platform !== "darwin") {
    assert.equal(isCompleteMacChromeApp("/tmp/chrome"), true);
    return;
  }
  const cacheExecutable = path.join(
    process.env.HOME ?? "",
    ".cache/puppeteer/chrome/mac_arm-141.0.7390.54/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );
  if (fs.existsSync(cacheExecutable)) {
    assert.equal(isCompleteMacChromeApp(cacheExecutable), false);
  }
  const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (fs.existsSync(systemChrome)) {
    assert.equal(isCompleteMacChromeApp(systemChrome), true);
  }
});
