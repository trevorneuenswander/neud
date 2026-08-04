#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertControlOrder(source, label) {
  const enableIndex = source.indexOf('label="Enable Display"');
  const onlineIndex = source.indexOf('label="Online Viewer"');
  const refreshIndex = source.indexOf('label="Refresh Rate"');
  const sizeIndex = source.indexOf('label="Display Size"');

  assert.ok(enableIndex >= 0, `${label} missing Enable Display row`);
  assert.ok(onlineIndex > enableIndex, `${label} Online Viewer must follow Enable Display`);
  assert.ok(refreshIndex > onlineIndex, `${label} Refresh Rate must follow Online Viewer`);
  assert.ok(sizeIndex > refreshIndex, `${label} Display Size must follow Refresh Rate`);
  assert.match(source, /DisplayCardControls/);
  assert.match(read("src/components/displays/DisplayCardControls.tsx"), /grid-cols-\[minmax\(0,1fr\)_auto\]/);
}

test("display card controls use stacked label-left toggle-right rows", () => {
  const controls = read("src/components/displays/DisplayCardControls.tsx");
  assert.match(controls, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(controls, /justify-end/);
});

test("all display card variants use the required control order", () => {
  assertControlOrder(
    read("src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx"),
    "BroadArrowTypedDisplayCard",
  );
  assertControlOrder(
    read("src/components/displays/DeveloperHtmlDisplayCard.tsx"),
    "DeveloperHtmlDisplayCard",
  );
  assertControlOrder(read("src/components/displays/DisplayCard.tsx"), "DisplayCard");
});

test("view fullscreen and view online remain in the action row", () => {
  for (const file of [
    "src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx",
    "src/components/displays/DeveloperHtmlDisplayCard.tsx",
    "src/components/displays/DisplayCard.tsx",
  ]) {
    const source = read(file);
    const fullscreenIndex = source.indexOf("View Fullscreen");
    const onlineIndex = source.indexOf("<ViewOnlineButton");
    assert.ok(fullscreenIndex >= 0, `${file} missing View Fullscreen`);
    assert.ok(onlineIndex > fullscreenIndex, `${file} View Online must follow View Fullscreen`);
  }
});
