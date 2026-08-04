import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("display cards render inline preview panel", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const custom = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /DisplayPreviewPanel/);
  assert.match(custom, /DisplayPreviewPanel/);
  assert.match(card, /DisclosureSection/);
});

test("expanded preview state is stored in project-level context", () => {
  const context = read("src/lib/displays/display-inline-preview-context.tsx");
  const card = read("src/components/displays/DisplayCard.tsx");
  assert.match(context, /expandedByProject/);
  assert.match(context, /setExpanded/);
  assert.match(card, /useDisplayInlinePreview/);
  assert.match(card, /open=\{previewOpen\}/);
});

test("detached persistent preview overlay is removed", () => {
  assert.throws(() => read("src/components/displays/PersistentDisplayPreviewDock.tsx"));
  assert.throws(() => read("src/lib/displays/persistent-display-preview-context.tsx"));
  const rootLayout = read("src/app/layout.tsx");
  assert.doesNotMatch(rootLayout, /PersistentDisplayPreview/);
  assert.match(rootLayout, /DisplayInlinePreviewProvider/);
});

test("iframe uses stable display and version key", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const preview = read("src/components/displays/DisplayPreviewPanel.tsx");
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");
  assert.match(card, /previewIframeKey/);
  assert.match(preview, /iframeKey/);
  assert.match(canvas, /key=\{iframeKey\}/);
});

test("preview expand uses inline state not global dock", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  assert.match(card, /handlePreviewOpenChange/);
  assert.match(card, /setExpanded\(projectId, displayPersistId, open\)/);
  assert.doesNotMatch(card, /preview panel/);
});

test("desktop stream ticker preview waits for nonzero layout before refresh", () => {
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(canvas, /previewLayoutReadyRef/);
  assert.match(canvas, /attemptLayoutRefreshOnce/);
  assert.match(canvas, /ResizeObserver/);
  assert.match(card, /enableStreamTickerLayoutRefresh=\{display\.slug === "stream-ticker"\}/);
});
