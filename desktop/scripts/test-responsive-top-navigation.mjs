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

test("project navigation supports horizontal and dropdown layouts", () => {
  const nav = read("src/components/projects/ProjectNav.tsx");
  assert.match(nav, /layoutMode/);
  assert.match(nav, /layout="horizontal"/);
  assert.match(nav, /ProjectNavDropdown/);
});

test("narrow layout uses dropdown without horizontal overflow", () => {
  const nav = read("src/components/projects/ProjectNav.tsx");
  assert.doesNotMatch(nav, /overflow-x-auto/);
});

test("dropdown includes keyboard escape handling and menu semantics", () => {
  const nav = read("src/components/projects/ProjectNav.tsx");
  assert.match(nav, /event\.key === "Escape"/);
  assert.match(nav, /role="menu"/);
  assert.match(nav, /aria-haspopup="menu"/);
  assert.match(nav, /aria-label="Project sections"/);
});

test("dropdown closes after navigation", () => {
  const nav = read("src/components/projects/ProjectNav.tsx");
  assert.match(nav, /setOpen\(false\)/);
});
