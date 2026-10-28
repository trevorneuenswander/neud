#!/usr/bin/env node
/**
 * NEUD v0.3.1 — worksheet discovery, LATER heading, sidebar/package visibility.
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

test("worksheet discovery tries feeds then htmlview/edit with typed errors", () => {
  const adapter = read("desktop/src/packages/sema/google-sheets-adapter.ts");
  assert.match(adapter, /feeds\/worksheets/);
  assert.match(adapter, /parseWorksheetsFromFeedsJson/);
  assert.match(adapter, /htmlview/);
  assert.match(adapter, /edit\?usp=sharing/);
  assert.match(adapter, /automatic tab discovery could not read worksheet metadata/);
  assert.match(adapter, /requires sign-in to list tabs/);
  assert.ok(adapter.includes(String.raw`items\.push\(\{\s*name:`));
  assert.doesNotMatch(
    adapter,
    /No worksheet tabs were found in the spreadsheet preview/,
  );
});

test("audience ticker heading stays LATER while Highlight swaps content", () => {
  const service = read("desktop/src/packages/sema/sema-schedule-service.ts");
  const html = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  const controls = read("src/components/sema/SemaHighlightControls.tsx");
  assert.match(service, /laterLabel:\s*"LATER"/);
  assert.match(html, /Audience-facing heading is always LATER/);
  assert.match(html, /var text = "LATER"/);
  assert.doesNotMatch(controls, /grid gap-1 text-sm text-foreground">\s*Label/);
  assert.match(controls, />\s*LATER\s*</);
  assert.doesNotMatch(controls, /Highlight activated\./);
});

test("desktop sidebar lists installed accessible projects only", () => {
  const hook = read("src/hooks/useSidebarProjects.ts");
  assert.match(hook, /scope:\s*"installed"/);
  assert.doesNotMatch(hook, /scope:\s*"directory"/);
  assert.match(hook, /neud:projects-directory-refreshed/);
  const projectsPage = read("src/components/projects/ProjectsPageClient.tsx");
  assert.match(projectsPage, /scope:\s*"directory"/);
  assert.match(projectsPage, /neud:projects-directory-refreshed/);
});

test("package card state does not report downloaded for not_downloaded installs", () => {
  const pkg = read("desktop/src/packages/project-package-service.ts");
  assert.match(pkg, /installState === "not_downloaded"/);
  assert.match(pkg, /installState !== "installed"/);
});

test("project detail does not mislabel access denial as not downloaded", () => {
  const layout = read("src/app/(portal)/projects/[slug]/layout.tsx");
  assert.match(layout, /resolution\.state === "denied"/);
  assert.match(layout, /notFound\(\)/);
  assert.doesNotMatch(
    layout,
    /denied[\s\S]{0,200}ProjectNotInstalledPanel/,
  );
  assert.match(layout, /isPackageInstalled === true/);
});

test("portal hosted queries still list RLS-visible projects", () => {
  const portal = read("src/lib/hosted/portal-queries.ts");
  const shell = read("src/components/portal/HostedAppShell.tsx");
  assert.match(portal, /from\("projects"\)/);
  assert.doesNotMatch(portal, /from\("project_members"\)/);
  assert.match(shell, /getHostedAccessibleProjects/);
});
