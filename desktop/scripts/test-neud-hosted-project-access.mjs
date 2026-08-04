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

test("hosted portal project list uses explicit membership query", () => {
  const queries = read("src/lib/hosted/portal-queries.ts");
  const projectsPage = read("src/app/portal/projects/page.tsx");
  const portalHome = read("src/app/portal/page.tsx");

  assert.match(queries, /getHostedAccessibleProjects/);
  assert.match(queries, /from\("project_members"\)/);
  assert.match(queries, /eq\("user_id", user\.id\)/);
  assert.match(queries, /byId\.set/);
  assert.doesNotMatch(queries, /from\("projects"\)\.select/);
  assert.match(projectsPage, /getHostedAccessibleProjects/);
  assert.match(portalHome, /getHostedPortalSummary/);
});

test("unauthenticated hosted project list returns empty array", () => {
  const queries = read("src/lib/hosted/portal-queries.ts");
  assert.match(queries, /if \(!user\) \{\s*return \[\];/);
});

test("hosted project detail routes reject unauthorized slugs via membership lookup", () => {
  const queries = read("src/lib/hosted/portal-queries.ts");
  assert.match(queries, /getHostedProjectPortalSummary/);
  assert.match(queries, /accessible\.find\(\(entry\) => entry\.slug === slug\)/);
});
