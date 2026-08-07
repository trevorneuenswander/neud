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

test("project access loading panel refreshes once when identity becomes ready", () => {
  const panel = read("src/components/projects/ProjectAccessStatePanel.tsx");
  assert.match(panel, /router\.refresh\(\)/);
  assert.match(panel, /refreshRequestedRef/);
  assert.match(panel, /localGetProjectsMeta/);
});

test("projects list polls identity after sign-in instead of stopping at loading", () => {
  const client = read("src/components/projects/ProjectsPageClient.tsx");
  assert.match(client, /identityStatus !== "loading"/);
  assert.match(client, /pollIdentity/);
  assert.match(client, /await loadProjects\(nextMeta\)/);
});
