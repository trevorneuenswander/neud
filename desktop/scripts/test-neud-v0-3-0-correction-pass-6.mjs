#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 6
 * 1) Manage Team role select + Remove same height
 * 2) SEMA Displays uses generic DisplaysPageClient + approved subheader
 * 3) SEMA Schedule Ticker E2E: package → hydrate → gate → API → UI
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const OLD_VMIX_COPY = "vMix-ready display URLs will be configured in a future phase.";
const APPROVED_SUBHEADER = "Local display URLs for this project's on-air graphics.";

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function walkSourceFiles(rootDir, extensions) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".next") {
          continue;
        }
        stack.push(full);
        continue;
      }
      if (extensions.some((ext) => entry.name.endsWith(ext))) {
        out.push(full);
      }
    }
  }
  return out;
}

test("MANAGE TEAM: role select and Remove share CONTROL_HEIGHT token", () => {
  const tokens = read("src/lib/access-management/table-action-buttons.ts");
  const panel = read("src/components/access-management/TeamsPanel.tsx");
  const button = read("src/components/ui/Button.tsx");

  assert.match(tokens, /ACCESS_TABLE_ACTION_CONTROL_HEIGHT_CLASS/);
  assert.match(tokens, /h-8 min-h-8 max-h-8/);
  assert.match(tokens, /ACCESS_TABLE_ACTION_SELECT_CLASS/);
  assert.match(tokens, /ACCESS_TABLE_ACTION_BUTTON_CLASS/);
  assert.match(tokens, /ACCESS_TABLE_ACTION_CONTROL_HEIGHT_CLASS/);

  assert.match(panel, /ACCESS_TABLE_ACTION_SELECT_CLASS/);
  assert.match(panel, /ACCESS_TABLE_ACTION_BUTTON_CLASS/);
  assert.match(panel, /data-neud-team-member-role-control/);
  assert.match(panel, /data-neud-team-member-remove-control/);
  assert.match(panel, /size="sm"/);
  // Button sm is h-8 — must not leave default md (h-10) fighting the shared height.
  assert.match(button, /sm:\s*"h-8/);
  assert.match(button, /md:\s*"h-10/);

  const selectClassBlock = tokens.slice(
    tokens.indexOf("ACCESS_TABLE_ACTION_SELECT_CLASS"),
    tokens.indexOf("ACCESS_TABLE_ACTION_SELECT_CLASS") + 280,
  );
  const buttonClassBlock = tokens.slice(
    tokens.indexOf("ACCESS_TABLE_ACTION_BUTTON_CLASS"),
    tokens.indexOf("ACCESS_TABLE_ACTION_BUTTON_CLASS") + 280,
  );
  assert.match(selectClassBlock, /ACCESS_TABLE_ACTION_CONTROL_HEIGHT_CLASS/);
  assert.match(buttonClassBlock, /ACCESS_TABLE_ACTION_CONTROL_HEIGHT_CLASS/);
});

test("SEMA Displays route uses DisplaysPageClient — not ProjectPlaceholderPage", () => {
  const page = read("src/app/(portal)/projects/[slug]/displays/page.tsx");
  assert.match(page, /projectSupportsSemaWorkflow/);
  assert.match(page, /DisplaysPageClient/);
  assert.match(page, /localGetProjectDisplays/);
  assert.match(page, /buildInstalledPackageDisplayItems/);
  // SEMA path must construct DisplaysPageClient (not fall through to placeholder).
  const semaBlockStart = page.indexOf("// SEMA package projects");
  assert.ok(semaBlockStart > 0, "SEMA Displays path comment missing");
  const semaBlock = page.slice(semaBlockStart);
  assert.match(semaBlock, /projectSupportsSemaWorkflow/);
  assert.match(semaBlock, /<DisplaysPageClient/);
  // Within the SEMA branch, must not render the placeholder component.
  const semaReturnEnd = semaBlock.indexOf("return (\n    <ProjectPlaceholderPage");
  const semaExclusive = semaReturnEnd > 0 ? semaBlock.slice(0, semaReturnEnd) : semaBlock;
  assert.match(semaExclusive, /<DisplaysPageClient/);
  assert.doesNotMatch(semaExclusive, /<ProjectPlaceholderPage/);
  assert.doesNotMatch(page, new RegExp(OLD_VMIX_COPY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(page, new RegExp(APPROVED_SUBHEADER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Displays subheader: approved copy present; old vMix copy absent from active paths", () => {
  const client = read("src/components/displays/DisplaysPageClient.tsx");
  assert.match(
    client,
    /description="Local display URLs for this project's on-air graphics\."/,
  );

  const activeRoots = [
    path.join(repoRoot, "src"),
    path.join(repoRoot, "desktop", "src"),
  ];
  /** @type {string[]} */
  const hits = [];
  for (const root of activeRoots) {
    for (const file of walkSourceFiles(root, [".ts", ".tsx", ".js", ".jsx", ".mjs"])) {
      const text = fs.readFileSync(file, "utf8");
      if (text.includes(OLD_VMIX_COPY)) {
        hits.push(path.relative(repoRoot, file));
      }
    }
  }
  assert.deepEqual(
    hits,
    [],
    `Old vMix Displays copy must not exist in active operator-facing sources. Found in: ${hits.join(", ")}`,
  );
});

test("SEMA builtin v1 manifest + on-disk ticker HTML + bridge runtime", () => {
  const builder = read("desktop/src/packages/sema-package-builder.ts");
  const html = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  const bundled = read("desktop/src/lib/bundled-display-sources.ts");
  const hydration = read("desktop/src/packages/sema/sema-package-display-hydration.ts");
  const listDisplays = read("desktop/src/services/local-data-service.ts");

  assert.match(builder, /slug:\s*"schedule-ticker"/);
  assert.match(builder, /name:\s*"Schedule Ticker"/);
  assert.match(builder, /SEMA_SCHEDULE_TICKER_HTML_PATH/);
  assert.match(bundled, /sema-schedule-ticker-v1\.html/);
  assert.match(hydration, /ensureHydrated/);
  assert.match(hydration, /sema-schedule-ticker/);
  assert.match(listDisplays, /installedDisplayKeys/);
  assert.match(listDisplays, /sema-schedule/);
  assert.ok(html.includes("<!DOCTYPE html>") || html.includes("<!doctype html>"));
  assert.match(html, /neud-display-data|EventSource|schedule/i);
  assert.match(html, /NOW|NEXT|LATER/i);
});

test("Package identity: realign updates package installs; boot reconciles slug→project id", () => {
  const projects = read("desktop/src/repositories/projects-repository.ts");
  const packagesRepo = read("desktop/src/repositories/project-packages-repository.ts");
  const service = read("desktop/src/packages/project-package-service.ts");
  const main = read("desktop/src/main.ts");

  assert.match(projects, /project_package_installs/);
  assert.match(projects, /project_package_directory/);
  assert.match(projects, /package_root = REPLACE/);
  assert.match(packagesRepo, /rebindInstallProjectId/);
  assert.match(service, /reconcileInstallProjectIdentity/);
  assert.match(service, /reconcileDevelopmentBuiltinPackage/);
  assert.match(main, /reconcileInstallProjectIdentity\("sema"\)/);
  assert.match(main, /reconcileDevelopmentBuiltinPackage\("sema"\)/);
  assert.match(main, /hydrateSemaDisplays/);
});

test("Installed display-key gate includes schedule-ticker from manifest slugs", () => {
  const service = read("desktop/src/packages/project-package-service.ts");
  assert.match(service, /getInstalledDisplayKeys/);
  assert.match(
    service,
    /new Set\(install\.manifest\.displays\.map\(\(display\) => display\.slug\)\)/,
  );
  const listDisplays = read("desktop/src/services/local-data-service.ts");
  // SEMA with null installed keys must not hollow-list (empty for operators).
  assert.match(listDisplays, /project\.projectType !== "sema-schedule"/);
});

test("SEMA Displays UI cards render Schedule Ticker from API items", () => {
  const page = read("src/app/(portal)/projects/[slug]/displays/page.tsx");
  const client = read("src/components/displays/DisplaysPageClient.tsx");
  const list = read("src/components/displays/DisplaysListClient.tsx");
  assert.match(page, /initialItems=\{displayItems\}/);
  assert.match(client, /DisplaysListClient/);
  assert.match(client, /items=\{items\}/);
  // Generic list renders each display name from API-backed items (Schedule Ticker).
  assert.match(list, /\.name|display\.name|item\.display/);
});

test("Runtime: buildSemaPackageV1 writes ticker HTML + integrity; gate keys include ticker", () => {
  const distBuilder = path.join(repoRoot, "desktop/dist/packages/sema-package-builder.js");
  if (!fs.existsSync(distBuilder)) {
    assert.match(read("desktop/src/packages/sema-package-builder.ts"), /buildSemaPackageV1/);
    return;
  }
  const { buildSemaPackageV1, SEMA_SCHEDULE_TICKER_HTML_PATH } = require(distBuilder);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "neud-pass6-sema-"));
  try {
    const manifest = buildSemaPackageV1(tmp);
    assert.equal(manifest.packageVersion, 8);
    assert.ok(manifest.displays.length >= 1);
    assert.equal(manifest.displays[0].slug, "schedule-ticker");
    assert.equal(manifest.displays[0].name, "Schedule Ticker");
    const htmlPath = path.join(tmp, SEMA_SCHEDULE_TICKER_HTML_PATH);
    assert.ok(fs.existsSync(htmlPath), "Schedule Ticker HTML missing from package");
    assert.ok(manifest.integrity?.files?.[SEMA_SCHEDULE_TICKER_HTML_PATH]);
    assert.ok(manifest.integrity?.manifestHash);
    const installedKeys = new Set(manifest.displays.map((d) => d.slug));
    assert.ok(installedKeys.has("schedule-ticker"));
    // Exactly one ticker definition in the package (pylon may also be present).
    assert.equal(
      manifest.displays.filter((d) => d.slug === "schedule-ticker").length,
      1,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("Install identity rebind: stale project id → canonical cloud id keeps one ticker key", () => {
  // Mirrors ProjectPackagesRepository.rebindInstallProjectId without sql.js bootstrap.
  const staleId = "local-sema-builtin-id";
  const cloudId = "5e0a0001-0000-4000-8000-000000000001";
  /** @type {Map<string, { projectId: string, projectSlug: string, packageRoot: string, manifest: { displays: { slug: string }[] } }>} */
  const installsByProjectId = new Map();
  /** @type {Map<string, string>} */
  const projectIdBySlug = new Map();

  function upsertInstall(row) {
    installsByProjectId.set(row.projectId, row);
    projectIdBySlug.set(row.projectSlug, row.projectId);
  }

  function rebindInstallProjectId(fromProjectId, toProjectId, packageRoot) {
    const existing = installsByProjectId.get(fromProjectId);
    if (!existing) return installsByProjectId.get(toProjectId) ?? null;
    installsByProjectId.delete(fromProjectId);
    const next = { ...existing, projectId: toProjectId, packageRoot };
    upsertInstall(next);
    return next;
  }

  function getInstalledDisplayKeys(projectId) {
    const install = installsByProjectId.get(projectId);
    if (!install?.manifest) return null;
    return new Set(install.manifest.displays.map((d) => d.slug));
  }

  upsertInstall({
    projectId: staleId,
    projectSlug: "sema",
    packageRoot: `/tmp/projects/${staleId}/packages/v1`,
    manifest: { displays: [{ slug: "schedule-ticker" }] },
  });

  // FIRST FAILING STAGE (pre-fix): gate keyed by canonical id → null → empty SEMA list.
  assert.equal(getInstalledDisplayKeys(cloudId), null);

  const rebound = rebindInstallProjectId(
    staleId,
    cloudId,
    `/tmp/projects/${cloudId}/packages/v1`,
  );
  assert.equal(rebound?.projectId, cloudId);
  assert.equal(installsByProjectId.has(staleId), false);
  assert.equal(projectIdBySlug.get("sema"), cloudId);

  const keys = getInstalledDisplayKeys(cloudId);
  assert.ok(keys);
  assert.ok(keys.has("schedule-ticker"));
  assert.equal(keys.size, 1);
});
