#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("access-loading copy is exactly Checking project access...", () => {
  const shared = read("shared/projects/project-access-copy.ts");
  assert.match(shared, /CHECKING_PROJECT_ACCESS_MESSAGE = "Checking project access\.\.\."/);
  const copy = read("src/lib/projects/project-access-copy.ts");
  assert.match(copy, /shared\/projects\/project-access-copy/);
  const panel = read("src/components/projects/ProjectAccessStatePanel.tsx");
  assert.match(panel, /CHECKING_PROJECT_ACCESS_MESSAGE/);
});

test("project slug is not rendered in access loading message", () => {
  const panel = read("src/components/projects/ProjectAccessStatePanel.tsx");
  assert.doesNotMatch(panel, /Checking project access for/);
  assert.doesNotMatch(panel, /\{slug\}/);
});
