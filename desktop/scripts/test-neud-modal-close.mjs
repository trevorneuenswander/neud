import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("shared overlay close button exists", () => {
  const button = read("src/components/ui/OverlayCloseButton.tsx");
  assert.match(button, /aria-label/);
  assert.match(button, /&#10005;/);
});

test("slide over panel uses overlay close button", () => {
  const panel = read("src/components/ui/SlideOverPanel.tsx");
  assert.doesNotMatch(panel, />\s*Close\s*</);
  assert.match(panel, /OverlayCloseButton/);
});

test("neud modal uses overlay close button", () => {
  const modal = read("src/components/ui/NeudModal.tsx");
  assert.match(modal, /OverlayCloseButton/);
  assert.match(modal, /showCloseButton/);
});

test("add display preserves unsaved upload confirmation", () => {
  const button = read("src/components/developer-tools/AddHtmlDisplayButton.tsx");
  assert.match(button, /Discard upload/);
  assert.match(button, /hasUnsavedUpload/);
});
