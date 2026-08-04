import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("displays page shows archived displays navigation button", () => {
  const page = read("src/components/displays/DisplaysPageClient.tsx");
  assert.match(page, /Archived Displays/);
  assert.match(page, /\/displays\/archived/);
  assert.match(page, /canManageSettings/);
});

test("archived displays route requires project settings access", () => {
  const archivedPage = read("src/app/(portal)/projects/[slug]/displays/archived/page.tsx");
  assert.match(archivedPage, /requireProjectSettingsAccess/);
  assert.match(archivedPage, /Archived Displays/);
  assert.match(archivedPage, /Back to Displays/);
});

test("archived list supports unarchive", () => {
  const list = read("src/components/displays/ArchivedDisplaysList.tsx");
  assert.match(list, /Unarchive/);
  assert.match(list, /localUnarchiveDisplay/);
});

test("archived empty state does not duplicate Back to Displays button", () => {
  const list = read("src/components/displays/ArchivedDisplaysList.tsx");
  const archivedPage = read("src/app/(portal)/projects/[slug]/displays/archived/page.tsx");
  assert.match(archivedPage, /Back to Displays/);
  assert.doesNotMatch(list, /Back to Displays/);
  assert.match(list, /No archived displays/);
});
