import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("sidebar renders projects submenu via SidebarProjectsNav", () => {
  const sidebar = read("src/components/portal/Sidebar.tsx");
  const navigation = read("src/components/portal/SidebarNavigation.tsx");
  const projectsNav = read("src/components/portal/SidebarProjectsNav.tsx");
  const navItem = read("src/components/portal/SidebarNavItem.tsx");
  const sharedClasses = read("src/lib/portal/sidebar-nav-item-classes.ts");
  assert.match(sidebar, /SidebarNavigation/);
  assert.match(navigation, /SidebarProjectsNav/);
  assert.match(navigation, /item\.href === "\/projects"/);
  assert.match(projectsNav, /href="\/projects"/);
  assert.match(projectsNav, /aria-expanded/);
  assert.match(projectsNav, /Collapse projects list|Expand projects list/);
  assert.match(sharedClasses, /SIDEBAR_PRIMARY_NAV_ROW_CLASS/);
  assert.match(sharedClasses, /SIDEBAR_PRIMARY_NAV_CHEVRON_CLASS/);
  assert.match(navItem, /SIDEBAR_PRIMARY_NAV_ROW_CLASS/);
  assert.match(projectsNav, /SIDEBAR_PRIMARY_NAV_ROW_CLASS/);
  assert.match(projectsNav, /SIDEBAR_PRIMARY_NAV_CHEVRON_CLASS/);
});

test("projects nav row matches primary sidebar height and chevron fits h-10 row", () => {
  const sharedClasses = read("src/lib/portal/sidebar-nav-item-classes.ts");
  const projectsNav = read("src/components/portal/SidebarProjectsNav.tsx");
  assert.match(sharedClasses, /flex h-10/);
  assert.match(sharedClasses, /SIDEBAR_PRIMARY_NAV_CHEVRON_CLASS[\s\S]*h-10 w-8/);
  assert.match(projectsNav, /flex h-10 items-stretch/);
  assert.doesNotMatch(projectsNav, /h-8 w-8/);
});

test("projects submenu reuses projects page list source", () => {
  const hook = read("src/hooks/useSidebarProjects.ts");
  assert.match(hook, /localListProjects/);
  assert.match(hook, /localGetProjectsMeta/);
  assert.match(hook, /resolveProjectsViewerMode/);
  const appShell = read("src/components/portal/AppShell.tsx");
  assert.match(appShell, /getVisibleProjects/);
  assert.doesNotMatch(hook, /setInterval/);
});

test("project landing href shared with Projects page list", () => {
  const route = read("src/lib/projects/project-landing-route.ts");
  const list = read("src/components/projects/ProjectList.tsx");
  assert.match(route, /buildProjectLandingHref/);
  assert.match(list, /buildProjectLandingHref/);
  assert.match(route, /resolveProjectsViewerMode/);
  assert.match(read("src/components/projects/ProjectsPageClient.tsx"), /resolveProjectsViewerMode/);
});

test("active project slug and highlight behavior", () => {
  const nav = read("src/components/portal/SidebarProjectsNav.tsx");
  assert.match(nav, /extractProjectSlugFromPathname/);
  assert.match(nav, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(nav, /truncate/);
});

test("submenu expansion preference and auto-expand in project workspace", () => {
  const pref = read("src/lib/portal/sidebar-projects-preference.ts");
  assert.match(pref, /neud:sidebar:projects-expanded/);
  const nav = read("src/components/portal/SidebarProjectsNav.tsx");
  assert.match(nav, /isProjectWorkspacePath/);
  assert.match(nav, /writeSidebarProjectsExpandedPreference/);
  assert.match(nav, /max-h-52/);
});

test("mobile nav includes projects submenu", () => {
  const mobile = read("src/components/portal/MobileNav.tsx");
  assert.match(mobile, /SidebarNavigation/);
  assert.match(mobile, /initialSidebarProjects/);
});

test("pinned viewer remains scoped per project layout", () => {
  const layout = read("src/app/(portal)/projects/[slug]/layout.tsx");
  assert.match(layout, /PinnedViewerProvider/);
  assert.match(layout, /projectId=\{access\.project\.id\}/);
});
