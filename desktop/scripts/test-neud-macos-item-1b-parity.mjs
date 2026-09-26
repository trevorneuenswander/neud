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

test("macOS hides in-window application menu via shell capabilities", () => {
  const capabilities = read("src/lib/desktop/shell-capabilities.ts");
  assert.match(capabilities, /showInWindowApplicationMenu/);
  assert.match(capabilities, /platform !== "darwin"/);

  const titleBar = read("src/components/portal/AppTitleBar.tsx");
  assert.match(titleBar, /showInWindowApplicationMenu/);
  assert.match(titleBar, /if \(!inWindowMenuEnabled\)/);

  const shell = read("src/components/portal/DesktopAppShell.tsx");
  assert.match(shell, /showInWindowApplicationMenu/);
  assert.doesNotMatch(shell, /desktopActive \? <AppTitleBar/);
});

test("Windows keeps in-window menu and title bar height", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /data-platform="darwin"/);
  assert.match(css, /:not\(\[data-platform="darwin"\]\)/);
  assert.match(css, /2\.25rem/);

  const titleBar = read("src/components/portal/AppTitleBar.tsx");
  assert.match(titleBar, /showWindowControls = platform !== "darwin"/);
});

test("native macOS application menu builder remains in desktop host", () => {
  const menu = read("desktop/src/menu/application-menu.ts");
  const ipc = read("desktop/src/ipc/app.ts");
  assert.match(menu, /buildApplicationMenu/);
  assert.match(menu, /process\.platform === "darwin"/);
  assert.match(ipc, /Menu\.setApplicationMenu/);
});

test("display viewer resolves project id from display slug when segment mismatches", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /resolveProjectForDisplayRoute/);
  assert.match(service, /getBySlug\(candidate\.id, trimmedSlug\)/);
  assert.match(service, /resolveProjectForDisplayRoute\(projectId, slug\)/);
});

test("display preview URLs prefer display.projectId over page project id", () => {
  const helper = read("src/lib/displays/resolve-display-preview-project-id.ts");
  assert.match(helper, /displayProjectId/);

  const htmlCard = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(htmlCard, /resolveDisplayPreviewProjectId/);
  assert.match(htmlCard, /previewProjectId/);

  const typedCard = read("src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx");
  assert.match(typedCard, /resolveDisplayPreviewProjectId/);
});

test("Broad Arrow stream display slugs remain stable for preview lookup", () => {
  const specs = read("desktop/src/displays/broad-arrow-stream-display-specs.ts");
  assert.match(specs, /stream-bid-display/);
  assert.match(specs, /stream-ticker/);
  assert.match(specs, /led-display-quail/);
});
