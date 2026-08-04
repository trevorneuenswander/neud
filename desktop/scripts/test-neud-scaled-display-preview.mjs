import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("shared preview uses 1920x1080 defaults", () => {
  const preview = read("src/components/displays/DisplayCanvasPreview.tsx");
  const size = read("src/lib/displays/display-size.ts");
  assert.match(preview, /DEFAULT_DISPLAY_WIDTH/);
  assert.match(preview, /DEFAULT_DISPLAY_HEIGHT/);
  assert.match(preview, /Math\.min\(widthScale, heightScale/);
  assert.match(size, /1920/);
  assert.match(size, /1080/);
});

test("add display preview uses shared canvas preview", () => {
  const upload = read("src/components/developer-tools/UploadHtmlDisplayForm.tsx");
  assert.match(upload, /DisplayCanvasPreview/);
  assert.doesNotMatch(upload, /DisplaySizeSelect/);
});

test("display preview panel delegates to canvas preview", () => {
  const panel = read("src/components/displays/DisplayPreviewPanel.tsx");
  assert.match(panel, /DisplayCanvasPreview/);
});
