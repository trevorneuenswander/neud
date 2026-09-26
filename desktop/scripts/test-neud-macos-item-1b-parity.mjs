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

  const darwinBlock = css.match(
    /html\[data-runtime="desktop"\]\[data-platform="darwin"\][\s\S]*?\}/,
  )?.[0];
  assert.ok(darwinBlock, "darwin desktop title bar CSS block");
  assert.match(darwinBlock, /--title-bar-height:\s*0px/);
  assert.match(darwinBlock, /--window-menu-height:\s*0px/);
  assert.match(darwinBlock, /--desktop-titlebar-height:\s*0px/);
  assert.match(darwinBlock, /--app-title-bar-height:\s*0px/);

  const unknownPlatformBlock = css.match(
    /html\[data-runtime="desktop"\]:not\(\[data-platform\]\)[\s\S]*?\}/,
  )?.[0];
  assert.ok(unknownPlatformBlock, "unknown platform desktop title bar CSS block");
  assert.match(unknownPlatformBlock, /--title-bar-height:\s*0px/);

  const win32Block = css.match(
    /html\[data-runtime="desktop"\]\[data-platform="win32"\][\s\S]*?\}/,
  )?.[0];
  assert.ok(win32Block, "win32 desktop title bar CSS block");
  assert.match(win32Block, /--title-bar-height:\s*2\.25rem/);
  assert.match(win32Block, /--window-menu-height:\s*var\(--title-bar-height\)/);
  assert.match(win32Block, /--desktop-titlebar-height:\s*var\(--title-bar-height\)/);
  assert.match(win32Block, /--app-title-bar-height:\s*var\(--title-bar-height\)/);

  const linuxBlock = css.match(
    /html\[data-runtime="desktop"\]\[data-platform="linux"\][\s\S]*?\}/,
  )?.[0];
  assert.ok(linuxBlock, "linux desktop title bar CSS block");
  assert.match(linuxBlock, /--title-bar-height:\s*2\.25rem/);
  assert.match(linuxBlock, /--window-menu-height:\s*var\(--title-bar-height\)/);

  assert.doesNotMatch(css, /:not\(\[data-platform="darwin"\]\)/);

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
