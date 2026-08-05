import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readRepo(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("project nav dropdown uses one shared fixed width constant", () => {
  const layout = readRepo("src/components/projects/project-nav-layout.ts");
  const nav = readRepo("src/components/projects/ProjectNav.tsx");
  assert.match(layout, /PROJECT_NAV_DROPDOWN_WIDTH = "16rem"/);
  assert.match(nav, /PROJECT_NAV_DROPDOWN_WIDTH/);
  assert.match(nav, /PROJECT_NAV_DROPDOWN_WIDTH_CLASS/);
});

test("dropdown trigger and panel share fixed width without flex growth", () => {
  const nav = readRepo("src/components/projects/ProjectNav.tsx");
  const dropdownSection = nav.slice(
    nav.indexOf("function ProjectNavDropdown"),
    nav.indexOf("export function ProjectNav"),
  );
  assert.doesNotMatch(dropdownSection, /flex-1/);
  assert.match(dropdownSection, /style=\{\{ width: PROJECT_NAV_DROPDOWN_WIDTH \}\}/);
});

test("longest menu labels fit the fixed width choice", () => {
  const labels = [
    "Overview",
    "Webpage Scraper",
    "Local Controller",
    "Displays",
    "Settings",
  ];
  const longest = labels.reduce((a, b) => (a.length >= b.length ? a : b));
  assert.equal(longest, "Local Controller");
  assert.ok(longest.length <= 18);
});
