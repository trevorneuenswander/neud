#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isStalePackagedBrowserErrorForPlatform,
  resolveSessionFacingEngineLastError,
} from "../dist/services/engine-session-facing-errors.js";

test("darwin hides stale win32 chrome path errors while running", () => {
  const message =
    "Unable to resolve the bundled Chrome executable Expected packaged browser at: /Applications/NEUD.app/Contents/Resources/puppeteer/chrome/chrome-win64/chrome.exe";
  assert.equal(isStalePackagedBrowserErrorForPlatform(message, "darwin"), true);
  if (process.platform === "darwin") {
    const hidden = resolveSessionFacingEngineLastError({
      actualState: "running",
      healthState: "healthy",
      lastError: message,
    });
    assert.equal(hidden, null);
  }
});

test("historical browser errors remain in sqlite but are not session-facing when stopped", () => {
  const message = "Failure stage: packaged_browser_missing";
  const hidden = resolveSessionFacingEngineLastError({
    actualState: "stopped",
    healthState: "warning",
    lastError: message,
  });
  assert.equal(hidden, null);
});
