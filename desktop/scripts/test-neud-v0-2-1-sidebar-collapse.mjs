import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readAll(relativePaths) {
  return relativePaths.map((p) => read(p)).join("\n");
}

const sidebar = read("src/components/portal/Sidebar.tsx");
const branding = read("src/components/portal/SidebarBranding.tsx");
const layout = read("src/lib/portal/sidebar-layout.ts");
const navItem = read("src/components/portal/SidebarNavItem.tsx");
const projectsNav = read("src/components/portal/SidebarProjectsNav.tsx");
const mobile = read("src/components/portal/MobileNav.tsx");
const tooltip = read("src/components/portal/SidebarTooltip.tsx");
const icons = read("src/lib/portal/sidebar-nav-icons.tsx");
const prefProjects = read("src/lib/portal/sidebar-projects-preference.ts");
const pinnedLayout = read("src/app/(portal)/projects/[slug]/layout.tsx");

test("default sidebar state is expanded on mount", () => {
  assert.match(sidebar, /useState\(false\)/);
  assert.match(sidebar, /SidebarCollapseProvider/);
});

test("toggle collapses and expands sidebar via branding control", () => {
  assert.match(sidebar, /onToggleSidebar=\{toggleSidebar\}/);
  assert.match(sidebar, /setCollapsed/);
  assert.match(branding, /onToggleSidebar/);
});

test("no persisted storage for sidebar collapse", () => {
  const corpus = readAll([
    "src/components/portal/Sidebar.tsx",
    "src/lib/portal/sidebar-collapse-context.tsx",
    "src/components/portal/SidebarBranding.tsx",
    "src/lib/portal/sidebar-layout.ts",
  ]);
  assert.doesNotMatch(corpus, /localStorage/);
  assert.doesNotMatch(corpus, /sessionStorage/);
  assert.doesNotMatch(corpus, /neud:sidebar:(?!projects-expanded)/);
  assert.doesNotMatch(corpus, /writeSidebar.*Collapse|readSidebar.*Collapse/i);
  assert.match(prefProjects, /neud:sidebar:projects-expanded/);
});

test("remount resets to expanded via initial state only", () => {
  assert.match(sidebar, /useState\(false\)/);
  assert.doesNotMatch(sidebar, /useEffect[\s\S]*collapsed/);
});

test("collapse toggle is not a separate row at top of sidebar", () => {
  assert.doesNotMatch(sidebar, /SidebarCollapseToggle/);
  assert.doesNotMatch(sidebar, /justify-end[\s\S]*SidebarBranding/);
  const headerBlock = sidebar.slice(
    sidebar.indexOf("border-b border-border px-2"),
    sidebar.indexOf('aria-label="Main"'),
  );
  assert.match(headerBlock, /SidebarBranding onToggleSidebar/);
  assert.equal((headerBlock.match(/SidebarBranding/g) ?? []).length, 1);
});

test("expanded branding row contains NEUD, version, and close control", () => {
  assert.match(branding, /APP_NAME/);
  assert.match(branding, /<AppVersion placement="sidebar" \/>/);
  assert.match(branding, /ExpandedSidebarCloseControl/);
  assert.match(branding, /flex w-full min-w-0 items-center/);
});

test("version sits next to NEUD in expanded row", () => {
  assert.match(branding, /items-baseline gap-2/);
  assert.match(branding, /\{APP_NAME\}[\s\S]*<AppVersion placement="sidebar" \/>/);
  assert.doesNotMatch(branding, /justify-between gap-2/);
});

test("panel icon has no arrow or chevron", () => {
  assert.match(icons, /SidebarPanelLeftIcon/);
  assert.doesNotMatch(icons, /SidebarPanelCollapseIcon|SidebarPanelExpandIcon/);
  const panelIcon = icons.slice(
    icons.indexOf("export function SidebarPanelLeftIcon"),
    icons.indexOf("export function resolveSidebarNavIcon"),
  );
  assert.doesNotMatch(panelIcon, /chevron|l-3-3|l3 3|M9 6l6 6/i);
  assert.doesNotMatch(panelIcon, /M14 12|M13 9/);
});

test('expanded close tooltip says "Close sidebar"', () => {
  assert.match(branding, /SidebarTooltip label="Close sidebar"/);
  assert.match(branding, /aria-label="Close sidebar"/);
});

test("collapsed default shows N brand mark", () => {
  assert.match(branding, /CollapsedSidebarOpenControl/);
  assert.match(branding, />\s*N\s*</);
});

test("collapsed branding uses same full-width center row as nav icons", () => {
  const classes = read("src/lib/portal/sidebar-nav-item-classes.ts");
  assert.match(classes, /SIDEBAR_COLLAPSED_CENTER_ROW_CLASS/);
  assert.match(branding, /SIDEBAR_COLLAPSED_CENTER_ROW_CLASS/);
  const collapsedOpen = branding.slice(
    branding.indexOf("function CollapsedSidebarOpenControl"),
    branding.indexOf("function ExpandedSidebarCloseControl"),
  );
  assert.match(collapsedOpen, /SidebarTooltip[\s\S]*SIDEBAR_COLLAPSED_CENTER_ROW_CLASS/);
  assert.match(classes, /w-full justify-center px-0/);
});

test("collapsed hover or focus swaps N to panel icon", () => {
  const collapsedControl = branding.slice(
    branding.indexOf("function CollapsedSidebarOpenControl"),
    branding.indexOf("function ExpandedSidebarCloseControl"),
  );
  assert.match(collapsedControl, /group-hover:opacity-0/);
  assert.match(collapsedControl, /group-hover:opacity-100/);
  assert.match(collapsedControl, /group-focus-visible:opacity/);
  assert.match(collapsedControl, /SidebarPanelLeftIcon/);
});

test('collapsed tooltip says "Open sidebar"', () => {
  assert.match(branding, /SidebarTooltip label="Open sidebar"/);
  assert.match(branding, /aria-label="Open sidebar"/);
});

test("collapsed open control is keyboard accessible", () => {
  const collapsedControl = branding.slice(
    branding.indexOf("function CollapsedSidebarOpenControl"),
    branding.indexOf("function ExpandedSidebarCloseControl"),
  );
  assert.match(collapsedControl, /<button/);
  assert.match(collapsedControl, /group-focus-visible:opacity-100/);
});

test("Settings nav uses gear icon", () => {
  const settingsIcon = icons.slice(
    icons.indexOf("export function SidebarSettingsIcon"),
    icons.indexOf("export function SidebarUserIcon"),
  );
  assert.match(settingsIcon, /circle cx="12" cy="12" r="3"/);
  assert.doesNotMatch(settingsIcon, /M12 1v2M12 21v2/);
});

test("expanded width uses shared 260px token", () => {
  assert.match(layout, /SIDEBAR_EXPANDED_WIDTH_PX = 260/);
  assert.match(read("src/app/globals.css"), /--sidebar-width: 260px/);
  assert.match(sidebar, /sidebarWidthPx/);
});

test("collapsed width is 56–64px target", () => {
  assert.match(layout, /SIDEBAR_COLLAPSED_WIDTH_PX = 60/);
});

test("sidebar width transition class present", () => {
  assert.match(layout, /SIDEBAR_WIDTH_TRANSITION_CLASS/);
  assert.match(layout, /duration-200/);
});

test("labels visible expanded and sr-only collapsed", () => {
  assert.match(navItem, /collapsed \? "sr-only"/);
});

test("projects submenu absent when sidebar collapsed", () => {
  assert.match(projectsNav, /if \(sidebarCollapsed\)/);
  assert.match(projectsNav, /SidebarTooltip label="Projects"/);
});

test("mobile nav unaffected — no collapse branding control", () => {
  assert.doesNotMatch(mobile, /onToggleSidebar/);
  assert.doesNotMatch(mobile, /CollapsedSidebarOpenControl/);
  assert.doesNotMatch(mobile, /SidebarCollapseProvider/);
});

test("pinned viewer layout not remounted by sidebar", () => {
  assert.match(pinnedLayout, /PinnedViewerProvider/);
  assert.doesNotMatch(sidebar, /PinnedViewer/);
});

test("tooltips use portal primitive", () => {
  assert.match(tooltip, /createPortal/);
  assert.match(tooltip, /neud-overlay-root/);
});

test("hosted shell uses shared Sidebar client", () => {
  const hosted = read("src/components/portal/HostedAppShellFrame.tsx");
  assert.match(hosted, /Sidebar/);
});
