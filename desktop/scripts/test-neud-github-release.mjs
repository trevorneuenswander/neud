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

  assert.match(downloadPage, /getCurrentNeudRelease/);
  assert.match(downloadPage, /ReleaseDownloadSection/);
  assert.match(downloadPage, /Previous versions/);
  assert.match(read("src/lib/releases/neud-releases.ts"), /NEUD_RELEASES/);
  assert.match(sidebar, /WindowsDownloadLink/);
  assert.match(topBar, /WindowsDownloadLink/);
  assert.match(settings, /WindowsDownloadLink/);
  assert.match(marketing, /href="\/download"/);
  assert.doesNotMatch(marketing, /macOS packaging is planned for Beta/i);
  assert.match(marketing, /Apple Silicon/i);
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

test("release packaging ensures app-update.yml before NSIS", () => {
  const desktopPkg = readJson("desktop/package.json");
  assert.match(desktopPkg.scripts["package:win"], /ensure-packaged-app-update-config\.mjs/);
  assert.match(desktopPkg.scripts["package:win"], /verify-packaged-auto-update-config\.mjs --require-latest-yml/);
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

test("release workflow validates signing and update logout tests", () => {
  const workflow = read(".github/workflows/release-windows.yml");
  assert.match(workflow, /require_code_signing:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /NEUD_REQUIRE_CODE_SIGNING: \$\{\{ inputs\.require_code_signing/);
  assert.match(workflow, /Building unsigned Alpha release/);
  assert.match(workflow, /test:neud-update-session-logout/);
  assert.match(workflow, /test:neud-code-signing/);
  assert.match(workflow, /if: inputs\.require_code_signing == true/);
  assert.match(workflow, /app-update\.yml/);
});

test("latest.yml matches package version when release output exists", () => {
  const rootPkg = readJson("package.json");
  const latestYmlPath = path.join(repoRoot, "desktop", "release", "latest.yml");
  if (!fs.existsSync(latestYmlPath)) {
    return;
  }
  const latestYml = fs.readFileSync(latestYmlPath, "utf8");
  const versionMatch = latestYml.match(/^version:\s*(.+)\s*$/m);
  if (!versionMatch || versionMatch[1].trim() !== rootPkg.version) {
    console.warn(
      `Skipping latest.yml version check: release output is ${versionMatch?.[1] ?? "missing"}, package.json is ${rootPkg.version}. Rebuild with npm run package:win.`,
    );
    return;
  }
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
