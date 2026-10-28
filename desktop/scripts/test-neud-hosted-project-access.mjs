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

test("hosted portal project list uses RLS-visible projects (membership + team admin)", () => {
  const queries = read("src/lib/hosted/portal-queries.ts");
  const projectsPage = read("src/app/portal/projects/page.tsx");
  const portalHome = read("src/app/portal/page.tsx");
  const auth = read("src/lib/projects/authorization.ts");
  const projectQueries = read("src/lib/projects/queries.ts");
  const permissions = read("src/lib/projects/project-permissions.ts");

  assert.match(queries, /getHostedAccessibleProjects/);
  assert.match(queries, /from\("projects"\)/);
  assert.match(queries, /byId\.set/);
  assert.doesNotMatch(queries, /from\("project_members"\)/);
  assert.match(projectsPage, /getHostedAccessibleProjects/);
  assert.match(portalHome, /getHostedPortalSummary/);

  assert.match(projectQueries, /from\("projects"\)/);
  assert.match(projectQueries, /get_project_access_level/);
  assert.match(auth, /get_project_access_level/);
  assert.match(auth, /has_team_assigned_manager_access|Team Admins inherit/);
  assert.match(permissions, /case "manager":\s*case "admin":\s*return "admin"/);
});

test("unauthenticated hosted project list returns empty array", () => {
  const queries = read("src/lib/hosted/portal-queries.ts");
  assert.match(queries, /if \(!user\) \{\s*return \[\];/);
});

test("hosted project detail routes reject unauthorized slugs via accessible list", () => {
  const queries = read("src/lib/hosted/portal-queries.ts");
  assert.match(queries, /getHostedProjectPortalSummary/);
  assert.match(queries, /accessible\.find\(\(entry\) => entry\.slug === slug\)/);
});
