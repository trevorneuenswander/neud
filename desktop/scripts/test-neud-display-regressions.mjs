import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function actionRow(source) {
  const match = source.match(/NoDrag className="flex flex-wrap gap-2"[\s\S]*?<\/NoDrag>/);
  assert.ok(match, "Action row missing");
  return match[0];
}

test("active display cards do not render standalone Preview button", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const custom = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.doesNotMatch(actionRow(card), />\s*Preview\s*<\/Button>/);
  assert.doesNotMatch(actionRow(custom), />\s*Preview\s*<\/Button>/);
  assert.match(card, /DisclosureSection/);
  assert.match(custom, /DisclosureSection/);
});

test("action order is Copy Local URL, View Fullscreen, Edit", () => {
  for (const file of [
    "src/components/displays/DisplayCard.tsx",
    "src/components/displays/DeveloperHtmlDisplayCard.tsx",
  ]) {
    const row = actionRow(read(file));
    const copyIndex = row.indexOf('aria-label="Copy local display URL"');
    const fullscreenIndex = row.indexOf("View Fullscreen");
    const editIndex = row.indexOf("DisplayEditMenu");
    assert.ok(copyIndex < fullscreenIndex, `${file}: fullscreen follows copy`);
    assert.ok(fullscreenIndex < editIndex, `${file}: edit follows fullscreen`);
  }
});

test("edit page aligns no-change status with save button", () => {
  const client = read("src/components/displays/DisplayEditClient.tsx");
  assert.match(client, /flex flex-wrap items-center justify-end gap-3/);
  assert.match(client, /No HTML changes to save/);
  assert.match(client, /Save as New Version/);
});

test("sortable drag uses end-only reorder baseline", () => {
  const list = read("src/components/displays/DisplaysListClient.tsx");
  assert.match(list, /onDragEnd={handleDragEnd}/);
  assert.doesNotMatch(list, /onDragOver={handleDragOver}/);
  assert.match(list, /\{\.\.\.listeners\}/);
  assert.doesNotMatch(list, /onPointerDown\?\.\(event\)/);
  assert.match(list, /arrayMove\(baseline, oldIndex, newIndex\)/);
});

test("displays page uses persisted sqlite display names", () => {
  const page = read("src/app/(portal)/projects/[slug]/displays/page.tsx");
  assert.match(page, /persistedName/);
  assert.match(page, /row\.name/);
});

test("preview mode serves display data while disabled", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(server, /!viewerState\.enabled && !previewMode/);
  assert.match(service, /buildDisplayDataUrl\(projectId, slug, previewMode\)/);
  assert.match(server, /getPylonDisplayData\(\{ preview: previewMode \}\)/);
});
