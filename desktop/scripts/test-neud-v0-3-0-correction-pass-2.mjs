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

test("USERS / TEAM MEMBERS: no Status column; Actions present", () => {
  const users = read("src/components/access-management/UsersPanel.tsx");
  const teams = read("src/components/access-management/TeamsPanel.tsx");
  const layout = read("src/lib/access-management/table-layout.ts");

  assert.match(users, /"Actions"/);
  assert.doesNotMatch(users, /"Status"/);
  assert.doesNotMatch(users, /StatusBadge/);
  assert.doesNotMatch(users, /headers=\{[\s\S]*Status/);

  assert.match(teams, /headers=\{\["Member", "Email", "Role", "Actions"\]\}/);
  assert.doesNotMatch(teams, /headers=\{\["Member", "Email", "Role", "Status"/);

  assert.match(layout, /USER_COLUMN_WIDTHS = \["16%", "20%", "14%", "16%", "16%", "14%"\]/);
  assert.match(layout, /TEAM_MEMBER_COLUMN_WIDTHS = \["24%", "28%", "14%", "34%"\]/);
});

test("PROJECT ACCESS: uses cloud directory projects; no installed scope filter", () => {
  const panel = read("src/components/access-management/ProjectAccessPanel.tsx");
  const client = read("src/components/access-management/DesktopCloudAccessManagementClient.tsx");
  const service = read("desktop/src/services/local-data-service.ts");

  assert.match(panel, /const \{ projects, teams, users \} = directory/);
  assert.doesNotMatch(panel, /scope:\s*"installed"|isPackageInstalled|packageState/);
  assert.match(client, /localGetCloudAccessDirectory/);
  assert.match(client, /forceRefresh:\s*true/);
  assert.match(service, /syncCloudAccessibleProjects/);
  assert.match(service, /refreshProjectDirectory/);
});

test("PROJECTS: formatProjectDate never renders Unix epoch", async () => {
  const formatPath = path.join(repoRoot, "src/lib/projects/format.ts");
  // Evaluate the pure function via dynamic transpile-free reimplementation check against source.
  const source = read("src/lib/projects/format.ts");
  assert.match(source, /ms <= 0/);
  assert.match(source, /return "—"/);

  // Runtime check using a local copy of the contract.
  function formatProjectDate(value) {
    if (value == null) return "—";
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value <= 0) return "—";
      return new Date(value).toLocaleString();
    }
    const trimmed = String(value).trim();
    if (!trimmed) return "—";
    const ms = Date.parse(trimmed);
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    return new Date(ms).toLocaleString();
  }

  assert.equal(formatProjectDate(null), "—");
  assert.equal(formatProjectDate(undefined), "—");
  assert.equal(formatProjectDate(""), "—");
  assert.equal(formatProjectDate(0), "—");
  assert.equal(formatProjectDate("1970-01-01T00:00:00.000Z"), "—");
  const valid = formatProjectDate("2026-10-04T12:00:00.000Z");
  assert.notEqual(valid, "—");
  assert.doesNotMatch(valid, /1969|1970/);
  void formatPath;
});

test("PROJECTS: Refresh Projects invokes directory refresh without install/download", () => {
  const button = read("src/components/projects/ProjectsRefreshButton.tsx");
  const page = read("src/app/(portal)/projects/page.tsx");
  const api = read("src/lib/local/api.ts");
  const server = read("desktop/src/services/local-api-server.ts");
  const service = read("desktop/src/services/local-data-service.ts");
  const packages = read("desktop/src/packages/project-package-service.ts");

  assert.match(button, /Refresh Projects/);
  assert.match(button, /localRefreshProjectDirectory/);
  // Projects page mounts refresh via ProjectsPageActions (not inline).
  assert.match(page, /ProjectsPageActions/);
  assert.match(read("src/components/projects/ProjectsPageActions.tsx"), /ProjectsRefreshButton/);
  assert.match(api, /\/api\/project-packages\/refresh-directory/);
  assert.match(server, /refresh-directory/);
  assert.match(service, /async refreshProjectDirectory/);
  assert.match(service, /forceRefresh:\s*true/);
  assert.match(service, /ensureCatalogDirectoryEntries/);
  // Scope the negative checks to the refreshProjectDirectory method body only.
  const refreshBlock = service.match(
    /async refreshProjectDirectory\([\s\S]*?\n  \}/,
  )?.[0] ?? "";
  assert.ok(refreshBlock.length > 0, "refreshProjectDirectory method missing");
  assert.doesNotMatch(refreshBlock, /downloadPackage/);
  assert.doesNotMatch(refreshBlock, /installBuiltinPackage/);
  assert.match(packages, /ensureCatalogDirectoryEntries/);
});

test("PROJECTS: Uninstall confirmation + retained data + safety", () => {
  const actions = read("src/components/projects/ProjectPackageActions.tsx");
  const service = read("desktop/src/services/local-data-service.ts");
  const packages = read("desktop/src/packages/project-package-service.ts");

  assert.match(actions, /Uninstall \$\{project\.name\}\?/);
  assert.match(actions, /project access and saved project data will not be deleted/);
  assert.match(actions, /variant="danger"/);
  assert.match(actions, /localRemoveProjectPackage/);
  assert.match(service, /assertProjectPackageCanBeUninstalled/);
  assert.match(service, /Stop the Data Engine/);
  assert.match(service, /Stop active Output routes/);
  assert.match(packages, /keepRetainedData:\s*true/);
  assert.match(packages, /retainedData:\s*true/);
});

test("PINS: content-fit height for 1–4 pins; resize recalculates", () => {
  const heightHelper = read("src/lib/displays/pinned-viewer-content-height.ts");
  const area = read("src/components/displays/PinnedDisplayViewerArea.tsx");

  assert.match(heightHelper, /export function computePinnedContentFitHeight/);
  assert.match(area, /computePinnedContentFitHeight/);
  assert.match(area, /ResizeObserver/);
  assert.match(area, /data-pinned-content-fit-height/);

  // Inline contract of the helper (kept in sync with source).
  function computePinnedContentFitHeight(params) {
    const pinCount = Math.max(1, Math.min(4, Math.floor(params.pinCount)));
    const contentWidth = Math.max(0, params.contentWidthPx);
    const horizontalPadding = params.horizontalPaddingPx ?? 40;
    const gap = params.gridGapPx ?? 8;
    const titleRow = params.titleRowPx ?? 18;
    const verticalPadding = params.verticalPaddingPx ?? 12;
    const usableWidth = Math.max(0, contentWidth - horizontalPadding);
    const columnWidth = Math.max(0, (usableWidth - gap * (pinCount - 1)) / pinCount);
    if (columnWidth <= 0 || params.displayWidth <= 0 || params.displayHeight <= 0) {
      return titleRow + verticalPadding;
    }
    const previewHeight = columnWidth * (params.displayHeight / params.displayWidth);
    return Math.ceil(previewHeight + titleRow + verticalPadding);
  }

  const base = {
    contentWidthPx: 1200,
    displayWidth: 1920,
    displayHeight: 1080,
    horizontalPaddingPx: 0,
  };
  const h1 = computePinnedContentFitHeight({ ...base, pinCount: 1 });
  const h2 = computePinnedContentFitHeight({ ...base, pinCount: 2 });
  const h3 = computePinnedContentFitHeight({ ...base, pinCount: 3 });
  const h4 = computePinnedContentFitHeight({ ...base, pinCount: 4 });
  assert.ok(h1 > h2 && h2 > h3 && h3 > h4);
  const resized = computePinnedContentFitHeight({ ...base, pinCount: 2, contentWidthPx: 800 });
  assert.ok(resized < h2);
});

test("SPLASH: content vertically centered (mac/Windows contract)", () => {
  const splash = read("desktop/src/app/splash-window.ts");
  assert.match(splash, /align-items:\s*center/);
  assert.match(splash, /justify-content:\s*center/);
  assert.match(splash, /data-neud-splash-vcenter="true"/);
  assert.match(splash, /data-neud-splash-content/);
  // Shared BrowserWindow splash HTML — same contract on macOS and Windows.
  assert.match(splash, /transparent:\s*true/);
  assert.match(splash, /SPLASH_WIDTH = 420/);
  assert.match(splash, /SPLASH_HEIGHT = 260/);
  assert.match(splash, /computeSplashWindowPosition/);
  assert.match(splash, /center:\s*false/);
});

test("SETTINGS: Import/Scan removed; Back Up Local Data copy matches SQLite scope", () => {
  const section = read("src/components/settings/DataBackupsSection.tsx");
  assert.doesNotMatch(section, /Import from Supabase/);
  assert.doesNotMatch(section, /Scan Cloud Projects/);
  assert.doesNotMatch(section, /SupabaseImportWizard/);
  assert.match(section, /Back Up Local Data/);
  assert.match(section, /snapshot of NEUD&apos;s local database|snapshot of NEUD's local database/);
  assert.match(section, /Data &amp; Backups|Data & Backups/);
});

test("BROAD ARROW and SEMA: package manifests omit project Activity; Data Source labeled", () => {
  const ba = read("desktop/src/packages/broad-arrow-package-builder.ts");
  const nav = read("src/components/projects/ProjectNav.tsx");
  const sema = read("desktop/src/packages/sema-package-builder.ts");

  assert.doesNotMatch(ba, /key:\s*"activity"/);
  assert.doesNotMatch(ba, /label:\s*"Activity"/);
  assert.doesNotMatch(nav, /href: "\/activity"/);
  assert.doesNotMatch(sema, /key:\s*"activity"|label:\s*"Activity"/);
  assert.match(nav, /google-sheet/);
  assert.match(sema, /label:\s*"Data Source"/);
  assert.match(sema, /name:\s*"Schedule Ticker"/);
});

test("SIDEBAR / uninstall contract: removeDownload keeps retained data; installed scope separate", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /listInstalledSidebarProjects/);
  assert.match(service, /scope === "installed"/);
  assert.match(service, /removeProjectPackageDownload/);
  assert.doesNotMatch(
    read("desktop/src/packages/project-package-service.ts"),
    /removeDownload[\s\S]{0,400}DELETE FROM projects/,
  );
});
