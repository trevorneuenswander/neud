import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("active display edit menu includes delete for owner admin workflow", () => {
  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(menu, /Delete/);
  assert.match(menu, /PermanentDeleteDisplayDialog/);
  assert.match(menu, /variant: "destructive"/);
  assert.match(menu, /separatorBefore: true/);
});

test("archived displays list includes delete action", () => {
  const list = read("src/components/displays/ArchivedDisplaysList.tsx");
  assert.match(list, /Delete/);
  assert.match(list, /PermanentDeleteDisplayDialog/);
});

test("delete requires typed confirmation", () => {
  const dialog = read("src/components/displays/PermanentDeleteDisplayDialog.tsx");
  assert.match(dialog, /DELETE/);
  assert.match(dialog, /cannot be undone/);
  assert.match(dialog, /Delete Permanently/);
});

test("delete api route exists on displays endpoint", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /method === "DELETE"/);
  assert.match(server, /deleteDisplay/);
});

test("delete creates tombstone and cleanup hooks", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /recordDeletion/);
  assert.match(service, /deleteByResource/);
  assert.match(service, /deleteDisplayTree/);
  assert.match(service, /deleteByDisplayId/);
});

test("delete is disabled only for protected display keys", () => {
  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(menu, /isProtectedDisplayKey/);
  assert.doesNotMatch(menu, /sourceType === "built-in"/);
  assert.match(read("src/lib/displays/protected-display-keys.ts"), /lower-ticker-v5/);
});

test("backend delete protects only required system display keys", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const deleteBlock = service.match(/deleteDisplay\(projectSlug[\s\S]*?this\.storage\.deleteDisplayTree/);
  assert.ok(deleteBlock, "deleteDisplay method missing");
  assert.match(deleteBlock[0], /PROTECTED_DISPLAY_KEYS\.has\(display\.displayKey\)/);
  assert.doesNotMatch(deleteBlock[0], /sourceType === "built-in"/);
});
