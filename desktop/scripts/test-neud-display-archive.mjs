import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("archive is enabled for active displays and only disabled while pending", () => {
  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.doesNotMatch(menu, /isBuiltIn/);
  assert.match(menu, /archivePending \|\| display\.archived/);
  assert.match(menu, /duplicatePending/);
});

test("archive confirmation preserves history and stable identity", () => {
  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(menu, /HTML version history/);
  assert.match(menu, /Activity history/);
  assert.match(menu, /stable ID/);
});

test("archive backend records metadata and disables display", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const archiveBlock = service.slice(
    service.indexOf("archiveDisplay("),
    service.indexOf("unarchiveDisplay("),
  );
  assert.match(archiveBlock, /archived: true/);
  assert.match(archiveBlock, /archivedAt/);
  assert.match(archiveBlock, /archivedByUserId/);
  assert.match(archiveBlock, /setEnabled\(displayId, false\)/);
});

test("archived displays page is owner admin only", () => {
  const archivedPage = read("src/app/(portal)/projects/[slug]/displays/archived/page.tsx");
  const page = read("src/components/displays/DisplaysPageClient.tsx");
  assert.match(archivedPage, /requireProjectSettingsAccess/);
  assert.match(page, /Archived Displays/);
  assert.match(page, /displays\/archived/);
});

test("unarchive route and service restore disabled active displays", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  const service = read("desktop/src/services/developer-tools-service.ts");
  const main = read("desktop/src/main.ts");
  assert.match(server, /\/unarchive\$/);
  assert.match(service, /unarchiveDisplay/);
  assert.match(service, /onDisplayUnarchived/);
  assert.match(main, /appendDisplayToUserOrder/);
});

test("archive migration adds metadata columns", () => {
  const migration = read("desktop/src/database/migrations/022_display_archive_metadata.sql");
  assert.match(migration, /archived_at/);
  assert.match(migration, /archived_by_user_id/);
});
