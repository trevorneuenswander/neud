import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("displays list uses dnd-kit sortable context", () => {
  const list = read("src/components/displays/DisplaysListClient.tsx");
  assert.match(list, /@dnd-kit\/core/);
  assert.match(list, /SortableContext/);
  assert.match(list, /verticalListSortingStrategy/);
  assert.match(list, /DragOverlay/);
  assert.match(list, /closestCenter/);
  assert.match(list, /handleDragEnd/);
  assert.doesNotMatch(list, /handleDragOver/);
  assert.match(list, /arrayMove/);
});

test("sortable cards animate with transform transitions", () => {
  const list = read("src/components/displays/DisplaysListClient.tsx");
  assert.match(list, /CSS\.Transform\.toString/);
  assert.match(list, /transition/);
  assert.match(list, /INTERACTIVE_SELECTOR/);
});

test("displays page skips order reset while drag is active", () => {
  const page = read("src/components/displays/DisplaysPageClient.tsx");
  assert.match(page, /dragActiveRef/);
  assert.match(page, /onDragActiveChange/);
});
