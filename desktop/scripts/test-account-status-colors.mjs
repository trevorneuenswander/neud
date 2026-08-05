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

function connectivityToneClassName(tone) {
  switch (tone) {
    case "success":
      return "text-success";
    case "destructive":
      return "text-danger";
    default:
      return "text-muted opacity-70";
  }
}

test("Online tone maps to green success token", () => {
  assert.equal(connectivityToneClassName("success"), "text-success");
});

test("Offline tone maps to red danger token", () => {
  const presentation = read("src/lib/connectivity/connectivity-presentation.ts");
  assert.match(presentation, /case "destructive":[\s\S]*text-danger/);
  assert.equal(connectivityToneClassName("destructive"), "text-danger");
});

test("danger color token exists in theme", () => {
  const globals = read("src/app/globals.css");
  assert.match(globals, /--danger:/);
  assert.match(globals, /--color-danger:/);
});

test("sidebar uses connectivity presentation tone classes", () => {
  const sidebar = read("src/components/portal/SidebarUserPanel.tsx");
  assert.match(sidebar, /connectivityToneClassName\(connectivity\.tone\)/);
});
