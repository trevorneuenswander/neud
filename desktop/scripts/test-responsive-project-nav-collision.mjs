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

test("project nav uses measured layout mode instead of fixed lg breakpoint", () => {
  const nav = read("src/components/projects/ProjectNav.tsx");
  const bar = read("src/components/projects/ProjectTopMenuBar.tsx");
  const hook = read("src/hooks/useProjectNavLayoutMode.ts");
  assert.match(hook, /ResizeObserver/);
  assert.match(hook, /needed > available/);
  assert.match(bar, /useProjectNavLayoutMode/);
  assert.match(nav, /layoutMode/);
  assert.doesNotMatch(nav, /lg:flex/);
  assert.doesNotMatch(nav, /lg:hidden/);
});

test("nav reserves hidden measurement row for width calculation", () => {
  const nav = read("src/components/projects/ProjectNav.tsx");
  assert.match(nav, /navMeasureRef/);
  assert.match(nav, /opacity-0/);
  assert.match(nav, /w-max/);
});

test("status controls stay shrink-0 while nav collapses first", () => {
  const bar = read("src/components/projects/ProjectTopMenuBar.tsx");
  const lastPoll = read("src/components/projects/ProjectLastPollStatus.tsx");
  assert.match(bar, /shrink-0/);
  assert.match(lastPoll, /shrink-0/);
});

test("dropdown retains keyboard and menu semantics when compact", () => {
  const nav = read("src/components/projects/ProjectNav.tsx");
  assert.match(nav, /event\.key === "Escape"/);
  assert.match(nav, /role="menu"/);
  assert.match(nav, /aria-haspopup="menu"/);
});
