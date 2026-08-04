import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("portal layout does not lock dashboard and activity scroll", () => {
  const layout = read("src/app/(portal)/layout.tsx");
  assert.doesNotMatch(layout, /overflow-hidden/);
});

test("app shell keeps scroll on portal-scroll-region", () => {
  const shell = read("src/components/portal/AppShell.tsx");
  assert.match(shell, /portal-scroll-region/);
  assert.match(shell, /overflow-y-auto/);
});

test("project pages retain dedicated scroll frame", () => {
  const frame = read("src/components/projects/ProjectLayoutFrame.tsx");
  assert.match(frame, /project-layout-frame/);
  assert.match(frame, /overflow-y-auto/);
});
