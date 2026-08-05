#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("sidebar download section hides CTA in desktop runtime", () => {
  const section = read("src/components/portal/SidebarDownloadLinkSection.tsx");
  assert.match(section, /isDesktopRuntimeClient\(\)/);
  assert.match(section, /return null/);
  assert.match(section, /SidebarDownloadLink/);
});

test("sidebar uses download section wrapper instead of always rendering CTA", () => {
  const sidebar = read("src/components/portal/Sidebar.tsx");
  assert.match(sidebar, /SidebarDownloadLinkSection/);
  assert.doesNotMatch(sidebar, /import \{ SidebarDownloadLink \}/);
});

test("public marketing page keeps Download Desktop CTA", () => {
  const marketing = read("src/components/marketing/MarketingHomePage.tsx");
  assert.match(marketing, /Download Desktop/);
  assert.match(marketing, /href="\/download"/);
});

test("hosted portal settings page keeps Download Desktop link", () => {
  const settings = read("src/app/portal/settings/page.tsx");
  assert.match(settings, /Download Desktop/);
  assert.match(settings, /WindowsDownloadLink/);
});

test("download links use centralized GitHub release URL module", () => {
  const moduleSource = read("src/lib/downloads/windows-installer.ts");
  assert.match(moduleSource, /trevorneuenswander/);
  assert.match(moduleSource, /NEUD-Setup-latest-x64\.exe/);
});

test("desktop runtime detection uses typed preload bridge", () => {
  const environment = read("src/lib/runtime/environment.ts");
  const neudEnv = read("src/lib/env/neud-env.ts");
  assert.match(environment, /shouldUseLocalDataClient/);
  assert.match(neudEnv, /window\.neudDesktop\?\.app/);
  assert.match(neudEnv, /desktop\?\.isDesktop\(\)/);
});

test("desktop settings page does not include public download CTA card", () => {
  const settings = read("src/app/(portal)/settings/page.tsx");
  assert.doesNotMatch(settings, /Download Desktop/);
  assert.match(settings, /ApplicationUpdatesSection/);
});
