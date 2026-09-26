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

test("macOS keeps title bar shell without in-window menu labels", () => {
  const capabilities = read("src/lib/desktop/shell-capabilities.ts");
  assert.match(capabilities, /showDesktopTitleBarShell/);
  assert.match(capabilities, /platform !== "darwin"/);

  const titleBar = read("src/components/portal/AppTitleBar.tsx");
  assert.doesNotMatch(titleBar, /if \(!inWindowMenuEnabled\) \{\s*return null;/);
  assert.match(titleBar, /inWindowMenuEnabled \? \(/);

  const shell = read("src/components/portal/DesktopAppShell.tsx");
  assert.match(shell, /showDesktopTitleBarShell/);
  assert.match(shell, /showTitleBarShell \? <AppTitleBar/);
});

test("macOS title bar height remains visible in desktop CSS", () => {
  const css = read("src/app/globals.css");
  const darwinBlock = css.match(
    /html\[data-runtime="desktop"\]\[data-platform="darwin"\][\s\S]*?\}/,
  )?.[0];
  assert.ok(darwinBlock);
  assert.match(darwinBlock, /--title-bar-height:\s*2\.25rem/);
});

test("display preview lookup diagnostic captures failing stage", () => {
  const diagnostic = read("desktop/src/lib/display-viewer-lookup-diagnostic.ts");
  assert.match(diagnostic, /published_content_missing/);
  assert.match(read("desktop/src/services/developer-tools-service.ts"), /describeDisplayViewerLookup/);
  assert.match(read("desktop/src/services/local-api-server.ts"), /diagnostic/);
});

test("preview mode can resolve published bundle from revision or draft fallback", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /resolveViewerPublishedBundle/);
  assert.match(service, /readDisplayRevision/);
});

test("runtime diagnostics expose scraper transport labels", () => {
  assert.match(
    read("src/lib/data-engines/scraper-transport-diagnostics.ts"),
    /Legacy Polling/,
  );
  assert.match(read("src/components/data-engines/webpage-scraper/RuntimeDiagnostics.tsx"), /label="Transport"/);
});

test("stale cross-platform Chrome errors are hidden from active engine status", () => {
  const helper = read("desktop/src/services/engine-session-facing-errors.ts");
  assert.match(helper, /isStalePackagedBrowserErrorForPlatform/);
  assert.match(helper, /chrome-win64/);
});

test("successful engine start clears persisted last_error", () => {
  const manager = read("desktop/src/services/engine-manager.ts");
  assert.match(manager, /actualState: "starting"[\s\S]*lastError: null/);
});

test("browser resolution failures include runtime platform metadata", () => {
  const resolver = read("workers/data-engine/src/browser/resolve-puppeteer-browser.js");
  assert.match(resolver, /Recorded at:/);
  assert.match(resolver, /Runtime platformKey:/);
});

test("desktop build info is written for diagnostics", () => {
  assert.match(read("desktop/scripts/sync-release-version.mjs"), /build-info\.json/);
  assert.match(read("desktop/src/app/release-version.ts"), /getDesktopBuildInfo/);
});
