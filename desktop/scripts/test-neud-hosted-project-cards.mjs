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

test("hosted projects page wraps each card in a project link", () => {
  const page = read("src/app/portal/projects/page.tsx");
  const card = read("src/components/projects/ProjectSummaryCard.tsx");
  assert.match(page, /ProjectSummaryCard/);
  assert.match(page, /href:\s*HOSTED_PORTAL_PATHS\.projectDisplays\(project\.slug\)/);
  assert.match(card, /<Link[\s\S]*href=\{project\.href\}/);
  assert.match(card, /focus-visible:ring/);
  assert.doesNotMatch(page, />\s*Open\s*<\/Link>/);
  assert.doesNotMatch(page, /justify-between[\s\S]*Open/);
});

test("portal dashboard recent projects use shared desktop-style project cards", () => {
  const dashboardClient = read("src/components/hosted/HostedPortalDashboardClient.tsx");
  assert.match(dashboardClient, /ProjectSummaryCard/);
  assert.match(dashboardClient, /HOSTED_PORTAL_PATHS\.projectDisplays\(project\.slug\)/);
  assert.doesNotMatch(dashboardClient, />\s*Open\s*<\/Link>/);
});

test("hosted project cards do not nest interactive controls inside the link", () => {
  const projectsPage = read("src/app/portal/projects/page.tsx");
  const dashboardClient = read("src/components/hosted/HostedPortalDashboardClient.tsx");
  assert.doesNotMatch(projectsPage, /<Link[\s\S]*<Button/);
  assert.doesNotMatch(dashboardClient, /<Link[\s\S]*<Button/);
});

test("hosted project access still uses membership-scoped queries", () => {
  const queries = read("src/lib/hosted/portal-queries.ts");
  assert.match(queries, /getHostedAccessibleProjects/);
  assert.match(queries, /from\("project_members"\)/);
});
