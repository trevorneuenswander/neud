#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 21 — New Project capability system + Stream Bid Y offset.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const CAPABILITY_IDS = [
  "data-source",
  "webpage-scraper",
  "live-chat",
  "scoreboard",
  "timer",
  "lower-thirds",
  "display-only",
  "social-feed",
  "results-leaderboard",
  "rundown-schedule",
  "election-results",
  "weather",
  "statistics",
  "manual-controller",
  "automation-trigger",
];

test("CAPABILITIES: catalog has all 15 ids in web + desktop mirrors", () => {
  const web = read("src/lib/projects/capabilities.ts");
  const desktop = read("desktop/src/projects/project-capabilities.ts");
  for (const id of CAPABILITY_IDS) {
    assert.match(web, new RegExp(`"${id}"`));
    assert.match(desktop, new RegExp(`"${id}"`));
  }
  assert.match(web, /Display Only \+ Data Source|display-only/);
  assert.match(web, /validateCapabilitySelection/);
  assert.match(web, /buildCapabilityNavItems/);
});

test("CAPABILITIES: BA and SEMA default migrations", () => {
  const sql = read("desktop/src/database/migrations/043_project_capabilities.sql");
  assert.match(sql, /bag-graphics/);
  assert.match(sql, /webpage-scraper/);
  assert.match(sql, /manual-controller/);
  assert.match(sql, /sema-schedule/);
  assert.match(sql, /data-source/);
  assert.match(sql, /rundown-schedule/);
  assert.match(read("desktop/src/database/migrate.ts"), /043_project_capabilities\.sql/);
});

test("CAPABILITIES: Supabase additive migrations 061/062", () => {
  const m061 = read("supabase/migrations/061_project_capabilities.sql");
  const m062 = read("supabase/migrations/062_create_project_with_capabilities.sql");
  assert.match(m061, /project_capabilities/);
  assert.match(m061, /modular/);
  assert.match(m061, /user_is_any_team_admin/);
  assert.match(m062, /create_project_with_capabilities/);
  assert.match(m062, /set_project_capabilities/);
  assert.match(m062, /You may only assign teams you administrate/);
  assert.match(m062, /access_level = 'manager'/);
});

test("CREATE: Team Admin / Owner create boundaries", () => {
  const data = read("desktop/src/services/local-data-service.ts");
  const access = read("desktop/src/services/access-management-service.ts");
  const authz = read("desktop/src/services/access-authorization-service.ts");
  const memberships = read(
    "desktop/src/repositories/local-project-memberships-repository.ts",
  );

  assert.match(data, /createProjectWithCapabilities/);
  assert.match(data, /Only the NEUD Owner and Team Admins may create projects/);
  assert.match(data, /ensureManagerMembership/);
  assert.match(data, /project\.created/);
  assert.match(data, /Updated project capabilities/);
  assert.match(access, /assignTeamsOnProjectCreate/);
  assert.match(access, /listAssignableTeamsForProjectCreate/);
  assert.match(access, /You may only assign teams you administrate/);
  assert.match(authz, /legacyMemberships/);
  assert.match(memberships, /ensureManagerMembership/);
});

test("UI: New Project wizard + Type column + settings editor", () => {
  const wizard = read("src/components/projects/NewProjectWizard.tsx");
  const list = read("src/components/projects/ProjectList.tsx");
  const page = read("src/app/(portal)/projects/page.tsx");
  const settings = read("src/app/(portal)/projects/[slug]/settings/page.tsx");
  const nav = read("src/components/projects/ProjectNav.tsx");

  assert.match(wizard, /Step \$\{step\} of 3/);
  assert.match(wizard, /Capabilities/);
  assert.match(wizard, /No Team/);
  assert.match(wizard, /Create Project/);
  assert.match(list, />Type</);
  assert.match(list, /ProjectCapabilityTags/);
  assert.match(page, /ProjectsPageActions/);
  assert.match(page, /canCreateProject/);
  assert.match(settings, /ProjectCapabilitiesEditor/);
  assert.match(nav, /buildCapabilityNavItems/);
  assert.match(nav, /capabilities/);
});

test("PACKAGE: modular v1 registration (Pass 22 adds creator auto-install)", () => {
  const pkg = read("desktop/src/packages/project-package-service.ts");
  const builder = read("desktop/src/packages/modular-package-builder.ts");
  const data = read("desktop/src/services/local-data-service.ts");
  assert.match(pkg, /registerNewProjectDirectoryEntry/);
  assert.match(pkg, /availableVersion/);
  assert.match(pkg, /installModularPackage/);
  assert.match(builder, /buildModularPackageV1/);
  assert.match(builder, /packageVersion: 1/);
  // Pass 22: creator path installs v1 immediately after create.
  assert.match(data, /downloadPackage/);
  assert.match(data, /publishModularPackageVersion/);
});

test("PLACEHOLDERS: unimplemented capability module pages exist", () => {
  // live-chat implemented in Pass 22 — excluded from placeholder set.
  for (const segment of [
    "scoreboard",
    "timer",
    "lower-thirds",
    "social-feed",
    "results",
    "election-results",
    "weather",
    "statistics",
    "automation",
    "data-source",
  ]) {
    const page = read(
      `src/app/(portal)/projects/[slug]/${segment}/page.tsx`,
    );
    assert.match(page, /CapabilityModulePlaceholder|redirect/);
    assert.doesNotMatch(page, /vMix-ready/);
  }
  const placeholder = read("src/components/projects/CapabilityModulePlaceholder.tsx");
  assert.match(placeholder, /coming in a future\s+phase/);
});

test("STREAM BID: Pass 21 offset superseded by Pass 22 fixed vertical slab", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /bitmap-composite/);
  assert.match(html, /buildNormalizedTitleBitmap|TITLE_SLAB_HEIGHT/);
  assert.match(html, /data-title-layout="pass22"/);
  assert.doesNotMatch(html, /ctx\.fillText\(text, titleX/);
  assert.doesNotMatch(html, /LOT_TITLE_BASELINE_VISUAL_OFFSET_Y/);
});
