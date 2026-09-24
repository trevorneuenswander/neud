import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const titleBar = readSrc("src/components/portal/AppTitleBar.tsx");
const desktopShell = readSrc("src/components/portal/DesktopAppShell.tsx");
const sidebar = readSrc("src/components/portal/Sidebar.tsx");
const appShell = readSrc("src/components/portal/AppShell.tsx");
const portalLayout = readSrc("src/app/(portal)/layout.tsx");
const topMenu = readSrc("src/components/projects/ProjectTopMenuBar.tsx");
const frame = readSrc("src/components/projects/ProjectLayoutFrame.tsx");
const globals = readSrc("src/app/globals.css");
const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");

// Window menu and sidebar (1-7)
test("window menu remains fixed at top with highest z-index", () => {
  assert.match(titleBar, /fixed left-0 right-0 top-0/);
  assert.match(titleBar, /z-\[1001\]/);
});

test("window menu height is shared via CSS variable and ResizeObserver", () => {
  assert.match(globals, /--window-menu-height: var\(--title-bar-height\)/);
  assert.match(titleBar, /--window-menu-height/);
  assert.match(titleBar, /ResizeObserver/);
});

test("content viewport begins below window menu only in desktop runtime", () => {
  assert.match(desktopShell, /desktopActive/);
  assert.match(desktopShell, /--window-menu-height/);
  assert.match(desktopShell, /absolute inset-x-0 bottom-0/);
  assert.doesNotMatch(desktopShell, /paddingTop/);
  assert.doesNotMatch(desktopShell, /marginTop/);
});

test("sidebar is not fixed at top-0 and fills content viewport height", () => {
  assert.match(sidebar, /h-full/);
  assert.match(sidebar, /overflow-hidden/);
  assert.doesNotMatch(sidebar, /fixed/);
  assert.doesNotMatch(sidebar, /top-0/);
  assert.doesNotMatch(sidebar, /inset-y-0/);
  assert.doesNotMatch(sidebar, /h-screen/);
  assert.doesNotMatch(sidebar, /h-dvh/);
});

test("sidebar branding and nav scroll independently within sidebar", () => {
  assert.match(sidebar, /SidebarBranding/);
  assert.match(sidebar, /overflow-y-auto/);
});

test("app shell passes full height to sidebar and main area", () => {
  assert.match(appShell, /app-shell flex h-full/);
  assert.match(appShell, /main-content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden/);
  assert.match(portalLayout, /h-full min-h-0 flex-1 flex-col overflow-hidden/);
});

test("sidebar z-index sits below window menu", () => {
  assert.match(globals, /\.sidebar[\s\S]*z-index: 30/);
});

// Project navigation and page content (8-18)
test("project navigation uses normal flow not fixed positioning", () => {
  assert.doesNotMatch(topMenu, /fixed left-0 right-0/);
  assert.doesNotMatch(topMenu, /sticky/);
  assert.doesNotMatch(topMenu, /top: "var\(--title-bar-height/);
  assert.match(topMenu, /shrink-0/);
});

test("project layout uses two-row flex with page scroll below navigation", () => {
  assert.match(frame, /project-layout-root flex min-h-0 w-full flex-1 flex-col overflow-hidden/);
  assert.doesNotMatch(frame, /project-layout-root[^"]*h-full/);
  assert.match(frame, /project-layout-frame min-h-0 flex-1 overflow-y-auto/);
  assert.match(frame, /pt-6/);
  assert.doesNotMatch(frame, /paddingTop:\s*\n?\s*"calc\(var\(--navigation-bar-height/);
});

test("shared project layout preserves page top padding once", () => {
  assert.match(frame, /px-4 pb-6 pt-6 lg:px-6/);
  assert.doesNotMatch(frame, /pt-\[var\(--navigation-bar-height/);
});

test("project navigation height is synced but not used as duplicate page offset", () => {
  assert.match(topMenu, /--navigation-bar-height/);
  assert.match(topMenu, /ResizeObserver/);
  assert.doesNotMatch(frame, /navigation-bar-height/);
});

test("project navigation z-index sits above page content", () => {
  assert.match(globals, /\.project-top-menu[\s\S]*z-index: 40/);
});

test("portal scroll region defers scrolling to project layout frame on project pages", () => {
  assert.match(globals, /\.main-content:has\(\.project-layout-root\) \.portal-scroll-region/);
  assert.match(globals, /overflow: hidden/);
  assert.match(globals, /padding: 0/);
});

// Scroll ownership (19-23)
test("non-project pages scroll via portal-scroll-region", () => {
  assert.match(appShell, /portal-scroll-region flex min-h-0 flex-1 flex-col overflow-y-auto/);
});

test("body does not create duplicate page scrollbar", () => {
  assert.match(globals, /html,\s*\nbody[\s\S]*overflow: hidden/);
});

test("project pages do not nest duplicate overflow-y-auto on portal scroll region", () => {
  assert.doesNotMatch(appShell, /project-layout-frame/);
  assert.match(frame, /overflow-y-auto/);
});

// Rate Refresh button (24-33)
test("refresh button keeps text-xs without transform scaling", () => {
  assert.match(controller, /!h-5 !w-auto !min-w-0 shrink-0 whitespace-nowrap !px-1\.5 !py-0\.5 text-xs leading-none/);
  assert.match(controller, /"Refresh Rates"/);
  assert.match(controller, /"Refreshing Rates…"/);
  assert.doesNotMatch(controller, /scale-/);
  assert.doesNotMatch(controller, /transform/);
  assert.doesNotMatch(controller, /text-\[10px\]/);
  assert.doesNotMatch(controller, /text-\[11px\]/);
});

test("refresh button box is smaller than default sm button", () => {
  const button = readSrc("src/components/ui/Button.tsx");
  assert.match(button, /sm: "h-8 px-3 text-xs"/);
  assert.match(controller, /!h-5 !w-auto !min-w-0/);
  assert.doesNotMatch(controller, /h-5 shrink-0 px-1 text-xs/);
});

test("manual bid heading layout restored without current bid workaround", () => {
  assert.match(
    controller,
    /const MANUAL_CARD_HEADING_ROW_CLASS = "flex min-h-8 items-start justify-between gap-3"/,
  );
  assert.doesNotMatch(controller, /mb-3 flex min-h-6/);
  assert.match(controller, /const MANUAL_SUMMARY_BOX_CLASS/);
});

test("manual refresh handler remains wired", () => {
  assert.match(controller, /refreshRatesManually/);
  assert.match(controller, /isRefreshingRates/);
  assert.match(controller, /onClick=\{\(\) => void refreshRatesManually\(\)\}/);
});
