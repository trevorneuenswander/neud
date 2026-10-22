import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("teams actions row keeps Manage then Delete with equal button sizing and left alignment", () => {
  const panel = read("src/components/access-management/TeamsPanel.tsx");
  const deleteBtn = read("src/components/access-management/AccessTeamDeleteButton.tsx");
  assert.match(panel, /flex flex-nowrap items-center justify-start gap-2/);
  assert.match(panel, /ACCESS_TABLE_ACTION_BUTTON_CLASS/);
  assert.match(panel, /Manage[\s\S]*AccessTeamDeleteButton/s);
  assert.doesNotMatch(panel, /Show members/);
  assert.match(deleteBtn, /ACCESS_TABLE_ACTION_BUTTON_CLASS/);
});

test("teams Create and Manage use NeudModal with members in Manage", () => {
  const panel = read("src/components/access-management/TeamsPanel.tsx");
  assert.match(panel, /NeudModal/);
  assert.match(panel, /showCreateModal/);
  assert.match(panel, /selectedTeamId/);
  assert.match(panel, /Members/);
  assert.doesNotMatch(panel, /expandedTeamId/);
});

test("NEUD team delete button is suppressed in teams panel wiring", () => {
  const deleteBtn = read("src/components/access-management/AccessTeamDeleteButton.tsx");
  assert.match(deleteBtn, /isProtectedNeudTeamId/);
});

test("project access lists assigned teams before user access", () => {
  const panel = read("src/components/access-management/ProjectAccessPanel.tsx");
  const assignedIndex = panel.indexOf("Assigned Teams");
  const userIndex = panel.indexOf("User Access");
  assert.ok(assignedIndex >= 0 && userIndex > assignedIndex);
});
