import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("displays list does not render visible drag handle", () => {
  const list = read("src/components/displays/DisplaysListClient.tsx");
  assert.doesNotMatch(list, /DisplayDragHandle/);
});

test("sortable drag uses dnd-kit overlay and end-only reorder", () => {
  const list = read("src/components/displays/DisplaysListClient.tsx");
  assert.match(list, /DragOverlay/);
  assert.match(list, /handleDragEnd/);
  assert.doesNotMatch(list, /handleDragOver/);
  assert.match(list, /\{\.\.\.listeners\}/);
});

test("sortable cards attach listeners on card root", () => {
  const list = read("src/components/displays/DisplaysListClient.tsx");
  assert.match(list, /activationConstraint: \{ distance: 6 \}/);
  assert.match(list, /onDragActiveChange/);
});

test("display cards wrap interactive controls with NoDrag", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const custom = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /NoDrag/);
  assert.match(custom, /NoDrag/);
});
