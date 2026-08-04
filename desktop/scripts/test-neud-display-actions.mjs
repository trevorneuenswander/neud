import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function actionRowOrder(source) {
  const actionRow = source.match(/NoDrag className="flex flex-wrap gap-2"[\s\S]*?<\/NoDrag>/);
  assert.ok(actionRow, "Action row missing");
  const row = actionRow[0];
  const copyIndex = row.indexOf('aria-label="Copy local display URL"');
  const fullscreenIndex = row.indexOf("View Fullscreen");
  const editIndex = row.indexOf("DisplayEditMenu");
  assert.notEqual(copyIndex, -1, "Copy Local URL missing");
  assert.notEqual(fullscreenIndex, -1, "View Fullscreen missing");
  assert.notEqual(editIndex, -1, "Edit menu missing");
  assert.doesNotMatch(row, />\s*Preview\s*<\/Button>/);
  assert.ok(copyIndex < fullscreenIndex, "View Fullscreen should follow Copy Local URL");
  assert.ok(fullscreenIndex < editIndex, "Edit should follow View Fullscreen");
}

test("registry and custom cards share action order", () => {
  actionRowOrder(read("src/components/displays/DisplayCard.tsx"));
  actionRowOrder(read("src/components/displays/DeveloperHtmlDisplayCard.tsx"));
});

test("View Fullscreen uses primary variant on both card types", () => {
  function assertPrimaryFullscreen(source) {
    const match = source.match(/<Button[\s\S]*?>\s*View Fullscreen\s*<\/Button>/);
    assert.ok(match, "View Fullscreen button missing");
    assert.match(match[0], /variant="primary"/);
  }
  assertPrimaryFullscreen(read("src/components/displays/DisplayCard.tsx"));
  assertPrimaryFullscreen(read("src/components/displays/DeveloperHtmlDisplayCard.tsx"));
});

test("registry View Fullscreen is not disabled when display is disabled", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const fullscreenButton = card.match(
    /variant="primary"[\s\S]*?>\s*View Fullscreen\s*<\/Button>/,
  );
  assert.ok(fullscreenButton, "View Fullscreen button missing");
  assert.doesNotMatch(fullscreenButton[0], /disabled=\{!enabled\}/);
});

test("Edit menu remains in action row wrapped by NoDrag", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  assert.match(card, /NoDrag className="flex flex-wrap gap-2"[\s\S]*DisplayEditMenu/);
});
