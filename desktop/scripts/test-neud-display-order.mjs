import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("display order uses per-user preferences", () => {
  const migration = read("desktop/src/database/migrations/016_user_display_order_and_user_soft_delete.sql");
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(migration, /user_display_order/);
  assert.match(service, /userDisplayOrder.saveOrder/);
});

test("reordering requires operator-level display permission", () => {
  const page = read("src/components/displays/DisplaysPageClient.tsx");
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(page, /canReorder=\{canReorder\}/);
  assert.match(service, /capabilities\.canOperateDisplays/);
});

test("failed order persistence rolls back in displays list client", () => {
  const list = read("src/components/displays/DisplaysListClient.tsx");
  assert.match(list, /onItemsChange\(rollbackItems\)/);
});

test("full-card sortable drag is enabled without visible drag handle", () => {
  const list = read("src/components/displays/DisplaysListClient.tsx");
  assert.doesNotMatch(list, /DisplayDragHandle/);
  assert.match(list, /useSortable/);
  assert.match(list, /SortableContext/);
});
