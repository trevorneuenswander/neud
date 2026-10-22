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

test("TEAM MODAL: Manage Team uses wide NeudModal sizing", () => {
  const panel = read("src/components/access-management/TeamsPanel.tsx");
  const modal = read("src/components/ui/NeudModal.tsx");
  assert.match(panel, /size="wide"/);
  assert.match(panel, /Manage \$\{selectedTeam\.name\}/);
  assert.match(modal, /size\?: "default" \| "wide"/);
  assert.match(modal, /wide:\s*"max-w-4xl"/);
  assert.match(modal, /data-neud-modal-size=\{size\}/);
  assert.match(panel, /overflow-x-auto/);
});

test("PROJECT ACCESS: Status header and status cells absent", () => {
  const panel = read("src/components/access-management/ProjectAccessPanel.tsx");
  const layout = read("src/lib/access-management/table-layout.ts");
  assert.match(
    panel,
    /headers=\{\["User", "Team", "Access Source", "Project Role", "Actions"\]\}/,
  );
  assert.doesNotMatch(
    panel,
    /headers=\{\["User", "Team", "Access Source", "Project Role", "Status"/,
  );
  assert.doesNotMatch(panel, /\{row\.status\}/);
  assert.match(
    layout,
    /PROJECT_ACCESS_COLUMN_WIDTHS = \[\s*"22%",\s*"18%",\s*"22%",\s*"16%",/,
  );
});

test("PROJECTS PAGE: Uninstall precedes status text; left-aligned; no Open", () => {
  const actions = read("src/components/projects/ProjectPackageActions.tsx");
  assert.match(actions, /items-start/);
  assert.match(actions, /justify-start/);
  assert.doesNotMatch(actions, /\bOpen\b/);

  const uninstallBtn = actions.indexOf('>\n            Uninstall\n          </Button>');
  const uninstallFallback = actions.indexOf(">Uninstall</Button>");
  const uninstallIdx =
    uninstallBtn >= 0
      ? uninstallBtn
      : actions.indexOf("Uninstall");
  const statusIdx = actions.indexOf("{statusText}");
  assert.ok(uninstallIdx >= 0 && statusIdx > uninstallIdx);

  // Update may follow status; Download still present for not_downloaded.
  assert.match(actions, /Downloading…|Download/);
  void uninstallFallback;
});

test("USERS PAGE: Project Access uses effective access helper", () => {
  const panel = read("src/components/access-management/UsersPanel.tsx");
  const roleModel = read("src/lib/access-management/role-model.ts");
  assert.match(panel, /formatEffectiveProjectAccessLabel/);
  assert.doesNotMatch(panel, /countDirectProjectAccess/);
  assert.match(roleModel, /export function listEffectiveProjectAccessForUser/);
  assert.match(roleModel, /export function formatEffectiveProjectAccessLabel/);
  assert.match(roleModel, /resolveProjectAccessSources/);
  assert.match(roleModel, /resolveHighestProjectRole/);
  assert.match(roleModel, /role: "Manager"/);
});
