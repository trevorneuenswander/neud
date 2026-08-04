import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("custom display cards include preview panel", () => {
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /DisplayPreviewPanel/);
  assert.match(card, /DisclosureSection/);
});

test("preview panel uses preview query param for disabled displays", () => {
  const panel = read("src/components/displays/DisplayPreviewPanel.tsx");
  assert.match(panel, /preview=1/);
  assert.match(panel, /hasActiveRevision/);
});

test("viewer resolves preview mode while disabled", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /preview\?: boolean/);
  assert.match(service, /previewMode/);
});

test("local api passes preview flag to viewer resolver", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /preview.*=== "1"/);
});

test("duplicate returns active version metadata", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const duplicateSection = service.slice(service.indexOf("duplicateDisplay("));
  assert.match(duplicateSection, /activeVersion:/);
});
