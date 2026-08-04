import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("add display uses html file upload workflow", () => {
  const form = read("src/components/developer-tools/UploadHtmlDisplayForm.tsx");
  const button = read("src/components/developer-tools/AddHtmlDisplayButton.tsx");
  assert.match(button, /Add Display/);
  assert.match(form, /Drop an HTML file here/);
  assert.match(form, /Choose HTML File/);
  assert.match(form, /accept="\.html,\.htm,text\/html"/);
  assert.doesNotMatch(form, /Display slug/);
  assert.doesNotMatch(form, /DisplayRefreshRateSelect/);
});

test("upload validates html extensions and preview iframe", () => {
  const upload = read("src/lib/displays/html-upload.ts");
  const form = read("src/components/developer-tools/UploadHtmlDisplayForm.tsx");
  assert.match(upload, /DISPLAY_HTML_MAX_BYTES/);
  assert.match(upload, /isHtmlUploadFilename/);
  assert.match(form, /HTML Preview/);
  assert.match(form, /sandbox=""/);
  assert.match(form, /srcDoc=\{selectedFile\.html\}/);
});

test("display name defaults from filename", () => {
  const upload = read("src/lib/displays/html-upload.ts");
  assert.match(upload, /displayNameFromFilename/);
});
