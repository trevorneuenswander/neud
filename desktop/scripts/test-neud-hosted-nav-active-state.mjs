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

function resolveHostedNavActiveState(pathname, href) {
  const normalizedPath = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (href === "/portal") {
    return normalizedPath === href;
  }
  if (normalizedPath === href) {
    return true;
  }
  return normalizedPath.startsWith(`${href}/`);
}

function activeItems(pathname) {
  const items = [
    { href: "/portal", label: "Dashboard" },
    { href: "/portal/projects", label: "Projects" },
    { href: "/portal/users", label: "Users and Access" },
    { href: "/portal/activity", label: "Activity" },
    { href: "/portal/settings", label: "Settings" },
    { href: "/download", label: "Download" },
  ];
  return items.filter((item) => resolveHostedNavActiveState(pathname, item.href));
}

test("hosted navigation exports segment-aware active matching", () => {
  const nav = read("src/lib/portal/hosted-navigation.ts");
  const sidebar = read("src/components/portal/SidebarNavItem.tsx");
  assert.match(nav, /resolveHostedNavActiveState/);
  assert.match(nav, /activeMatch: "exact"/);
  assert.match(sidebar, /resolveHostedNavActiveState/);
});

test("/portal activates Dashboard only", () => {
  const active = activeItems("/portal");
  assert.deepEqual(
    active.map((item) => item.label),
    ["Dashboard"],
  );
});

test("/portal/projects activates Projects only", () => {
  const active = activeItems("/portal/projects");
  assert.deepEqual(
    active.map((item) => item.label),
    ["Projects"],
  );
});

test("nested project routes keep Projects active", () => {
  for (const pathname of [
    "/portal/projects/broad-arrow-auctions",
    "/portal/projects/broad-arrow-auctions/displays",
    "/portal/projects/broad-arrow-auctions/displays/stream-bid-display",
  ]) {
    const active = activeItems(pathname);
    assert.deepEqual(
      active.map((item) => item.label),
      ["Projects"],
      pathname,
    );
  }
});

test("/portal/users, activity, and settings activate one section each", () => {
  assert.deepEqual(activeItems("/portal/users").map((item) => item.label), [
    "Users and Access",
  ]);
  assert.deepEqual(activeItems("/portal/activity").map((item) => item.label), ["Activity"]);
  assert.deepEqual(activeItems("/portal/settings").map((item) => item.label), ["Settings"]);
});

test("profile route is not a primary hosted navigation item", () => {
  const nav = read("src/lib/portal/hosted-navigation.ts");
  const sidebar = read("src/components/portal/SidebarUserPanel.tsx");
  assert.doesNotMatch(nav, /label: "Profile"/);
  assert.match(sidebar, /profileHref/);
  assert.match(read("src/components/portal/HostedAppShellFrame.tsx"), /HOSTED_PORTAL_PATHS\.profile/);
});

test("similar path names do not create false dashboard matches", () => {
  assert.equal(resolveHostedNavActiveState("/portal/projects", "/portal"), false);
  assert.equal(resolveHostedNavActiveState("/portal/projects-old", "/portal/projects"), false);
});

test("query strings do not affect matching", () => {
  assert.equal(resolveHostedNavActiveState("/portal/projects?tab=1", "/portal/projects"), true);
  assert.equal(resolveHostedNavActiveState("/portal?welcome=1", "/portal"), true);
});

test("only one primary navigation item is active on sample routes", () => {
  for (const pathname of [
    "/portal",
    "/portal/projects",
    "/portal/projects/demo",
    "/portal/users",
    "/portal/activity",
    "/portal/settings",
  ]) {
    assert.equal(activeItems(pathname).length, 1, pathname);
  }
});
