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

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

test("windows installer download URL is centralized", () => {
  const moduleSource = read("src/lib/downloads/windows-installer.ts");
  assert.match(moduleSource, /NEUD_GITHUB_RELEASE_OWNER = "trevorneuenswander"/);
  assert.match(moduleSource, /NEUD_GITHUB_RELEASE_REPO = "neud"/);
  assert.match(moduleSource, /NEUD_WINDOWS_STABLE_INSTALLER_FILENAME = "NEUD-Setup-latest-x64\.exe"/);
  assert.match(moduleSource, /NEXT_PUBLIC_NEUD_WINDOWS_DOWNLOAD_URL/);
  assert.match(moduleSource, /releases\/latest\/download\//);
});

test("hosted web download components use centralized GitHub URL", () => {
  const downloadPage = read("src/app/(public)/download/page.tsx");
  const marketing = read("src/components/marketing/MarketingHomePage.tsx");
  const sidebar = read("src/components/portal/SidebarDownloadLink.tsx");
  const topBar = read("src/components/portal/HostedPortalTopBar.tsx");
  const settings = read("src/app/portal/settings/page.tsx");
  const login = read("src/app/(public)/login/page.tsx");

  assert.match(downloadPage, /WindowsDownloadButton/);
  assert.match(downloadPage, /windows-installer/);
  assert.match(sidebar, /WindowsDownloadLink/);
  assert.match(topBar, /WindowsDownloadLink/);
  assert.match(settings, /WindowsDownloadLink/);
  assert.match(marketing, /href="\/download"/);
  assert.match(login, /href="\/download"/);
});

test("desktop runtime hides sidebar download CTA", () => {
  const section = read("src/components/portal/SidebarDownloadLinkSection.tsx");
  assert.match(section, /isDesktopRuntimeClient\(\)/);
  assert.match(section, /return null/);
});

test("electron-builder GitHub publish provider matches repository", () => {
  const config = read("desktop/electron-builder.yml");
  assert.match(config, /provider: github/);
  assert.match(config, /owner: trevorneuenswander/);
  assert.match(config, /repo: neud/);
  assert.match(config, /releaseType: draft/);
  assert.doesNotMatch(config, /token:/i);
  assert.doesNotMatch(config, /GH_TOKEN/);
});

test("local package scripts default to publish never", () => {
  const desktopPkg = readJson("desktop/package.json");
  assert.match(desktopPkg.scripts["package:win"], /--publish never/);
});

test("prepare-release-artifacts creates stable installer alias", () => {
  const script = read("desktop/scripts/prepare-release-artifacts.mjs");
  assert.match(script, /NEUD-Setup-latest-x64\.exe/);
  assert.match(script, /latest\.yml/);
  assert.match(script, /\.blockmap/);
  assert.match(script, /versionedInstaller/);
});

test("release workflow requires manual dispatch", () => {
  const workflow = read(".github/workflows/release-windows.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /version:/);
  assert.doesNotMatch(workflow, /^\s+push:\s*$/m);
  assert.match(workflow, /prepare-release-artifacts/);
  assert.match(workflow, /NEUD-Setup-latest-x64\.exe/);
});

test("release workflow uses GITHUB_TOKEN from Actions", () => {
  const workflow = read(".github/workflows/release-windows.yml");
  assert.match(workflow, /secrets\.GITHUB_TOKEN/);
  assert.doesNotMatch(workflow, /ghp_[A-Za-z0-9]+/);
});

test("release workflow references public Supabase secrets only", () => {
  const workflow = read(".github/workflows/release-windows.yml");
  assert.match(workflow, /secrets\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(workflow, /secrets\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(workflow, /secrets\.SUPABASE_SERVICE_ROLE/);
});

test("release workflow validates public Supabase config before release build", () => {
  const workflow = read(".github/workflows/release-windows.yml");
  const validateIndex = workflow.indexOf("Validate public Supabase configuration");
  const npmCiIndex = workflow.indexOf("Install dependencies");
  const releaseBuildIndex = workflow.indexOf("Build desktop release");
  assert.ok(validateIndex >= 0, "Missing Supabase validation step");
  assert.ok(validateIndex < npmCiIndex, "Validation must run before npm ci");
  assert.ok(validateIndex < releaseBuildIndex, "Validation must run before release build");
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(workflow, /value not logged/i);
});

test("release workflow uses Node 22 and current action versions", () => {
  const workflow = read(".github/workflows/release-windows.yml");
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v5/);
  assert.match(workflow, /node-version: "22"/);
});

test("latest.yml matches package version when release output exists", () => {
  const rootPkg = readJson("package.json");
  const latestYmlPath = path.join(repoRoot, "desktop", "release", "latest.yml");
  if (!fs.existsSync(latestYmlPath)) {
    return;
  }
  const latestYml = fs.readFileSync(latestYmlPath, "utf8");
  assert.match(latestYml, new RegExp(`^version:\\s*${rootPkg.version}\\s*$`, "m"));
  assert.match(
    latestYml,
    new RegExp(`^path:\\s*NEUD-Setup-${rootPkg.version.replace(/\./g, "\\.")}-x64\\.exe\\s*$`, "m"),
  );
  const blockmap = path.join(
    repoRoot,
    "desktop",
    "release",
    `NEUD-Setup-${rootPkg.version}-x64.exe.blockmap`,
  );
  assert.equal(fs.existsSync(blockmap), true, "Missing blockmap next to latest.yml");
});

test("release documentation covers initial and future releases", () => {
  const doc = read("docs/github-release.md");
  assert.match(doc, /v0\.1\.1/);
  assert.match(doc, /v0\.1\.2/);
  assert.match(doc, /NEUD-Setup-latest-x64\.exe/);
  assert.match(doc, /Do not overwrite/);
  assert.match(doc, /SmartScreen/);
});

test("sensitive release outputs remain gitignored", () => {
  const gitignore = read(".gitignore");
  for (const pattern of [
    "desktop/release/",
    "desktop/dist/",
    "desktop/staging/",
    "desktop/.release-scan/",
    ".next/",
    ".env*",
    "*.exe",
    "*.blockmap",
  ]) {
    assert.match(gitignore, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
