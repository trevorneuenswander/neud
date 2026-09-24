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

test("hosted nav uses Users and Access label", () => {
  const hostedNav = read("src/lib/portal/hosted-navigation.ts");
  assert.match(hostedNav, /label: "Users and Access"/);
  assert.doesNotMatch(hostedNav, /label: "Users", adminOnly/);
  assert.match(hostedNav, /Users and Access/);
});

test("hosted shell passes accessible projects into shared sidebar navigation", () => {
  const shell = read("src/components/portal/HostedAppShell.tsx");
  const frame = read("src/components/portal/HostedAppShellFrame.tsx");
  assert.match(shell, /getHostedAccessibleProjects/);
  assert.match(shell, /initialSidebarProjects/);
  assert.match(frame, /initialSidebarProjects=\{initialSidebarProjects\}/);
  assert.match(frame, /initialSidebarProjects=\{initialSidebarProjects\}/);
  assert.match(read("src/components/portal/Sidebar.tsx"), /SidebarNavigation/);
  assert.match(frame, /MobileNavProvider/);
  assert.match(frame, /initialSidebarProjects=\{initialSidebarProjects\}/);
});

test("shared navigation renders projects submenu for hosted projects href", () => {
  const navigation = read("src/components/portal/SidebarNavigation.tsx");
  const route = read("src/lib/projects/project-landing-route.ts");
  assert.match(route, /isProjectsNavHref/);
  assert.match(route, /HOSTED_PORTAL_PATHS\.projects/);
  assert.match(navigation, /isProjectsNavHref\(item\.href\)/);
  assert.match(navigation, /projectsHref=\{item\.href\}/);
  assert.doesNotMatch(navigation, /item\.href === "\/projects"/);
});

test("hosted project submenu links match hosted projects page landing routes", () => {
  const projectsNav = read("src/components/portal/SidebarProjectsNav.tsx");
  const route = read("src/lib/projects/project-landing-route.ts");
  const portalPage = read("src/app/portal/projects/page.tsx");
  assert.match(route, /HOSTED_PORTAL_PATHS\.projectDisplays/);
  assert.match(projectsNav, /projectsHref/);
  assert.match(projectsNav, /buildProjectLandingHref\(slug, viewerMode, projectsHref\)/);
  assert.match(portalPage, /HOSTED_PORTAL_PATHS\.projectDisplays\(project\.slug\)/);
});

test("hosted and desktop project workspace paths recognized for submenu state", () => {
  const navigation = read("src/lib/portal/navigation.ts");
  const route = read("src/lib/projects/project-landing-route.ts");
  assert.match(navigation, /\/portal\\\/projects/);
  assert.match(route, /\/portal\\\/projects/);
});

test("desktop AppShell project wiring unchanged", () => {
  const appShell = read("src/components/portal/AppShell.tsx");
  assert.match(appShell, /getVisibleProjects/);
  assert.match(appShell, /initialSidebarProjects=\{initialSidebarProjects\}/);
});
