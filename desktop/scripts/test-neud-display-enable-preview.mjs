import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("display cards gate inline preview iframe on enabled state", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const custom = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  const preview = read("src/components/displays/DisplayPreviewPanel.tsx");

  assert.match(card, /enabled=\{enabled\}/);
  assert.match(custom, /enabled=\{enabled\}/);
  assert.match(preview, /if \(!enabled\)/);
  assert.match(preview, /Display data is disconnected/);
});

test("expanded preview state remains independent from enabled state", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const context = read("src/lib/displays/display-inline-preview-context.tsx");

  assert.match(context, /expandedByProject/);
  assert.match(card, /open=\{previewOpen\}/);
  assert.match(card, /handlePreviewOpenChange/);
  assert.doesNotMatch(card, /setExpanded\(projectId, displayPersistId, false\)/);
});

test("disable immediately marks preview disconnected and clears bridge readiness", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  assert.match(card, /setBridgeReady\(false\)/);
  assert.match(card, /setConnectionState\("disconnected"\)/);
  assert.match(card, /notifyDisplayConnectionChanged/);
});

test("status labels use Data Connected and Data Disconnected", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  const custom = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");

  assert.match(card, /Data Connected/);
  assert.match(card, /Data Disconnected/);
  assert.match(custom, /Data Connected/);
  assert.match(custom, /Data Disconnected/);
  assert.match(card, /bridgeReady/);
});

test("re-enable reconnects expanded preview without another expand click", () => {
  const preview = read("src/components/displays/DisplayPreviewPanel.tsx");
  assert.match(preview, /if \(!enabled\)/);
  assert.doesNotMatch(preview, /previewOpen/);
});

test("enable mutation uses persisted enabled field in sqlite", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const repo = read("desktop/src/repositories/displays-repository.ts");
  assert.match(service, /setDisplayEnabled/);
  assert.match(service, /this\.displays\.setEnabled/);
  assert.match(repo, /setEnabled/);
});

test("stable iframe key uses display id and active version", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  assert.match(card, /previewIframeKey/);
  assert.match(card, /activeVersionNumber/);
});

test("supabase sync is queued without blocking local toggle", () => {
  const card = read("src/components/displays/DisplayCard.tsx");
  assert.match(card, /localSetDisplayEnabled/);
  assert.match(card, /notifyDisplayConnectionChanged/);
  assert.doesNotMatch(card, /await.*supabase/i);
});
