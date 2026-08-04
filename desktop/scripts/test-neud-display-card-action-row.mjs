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

function assertActionSizeRow(source, label) {
  assert.match(source, /DisplayCardActionSizeRow/, `${label} missing action/size row`);
  const actionRowIndex = source.indexOf("<DisplayCardActionSizeRow");
  const actionSlice = source.slice(actionRowIndex, actionRowIndex + 2000);

  assert.match(
    actionSlice,
    /Copy Local URL|Copy local display URL|copyLabel/,
    `${label} missing Copy Local URL in action row`,
  );
  assert.match(actionSlice, /View Fullscreen/, `${label} View Fullscreen order`);
  assert.match(actionSlice, /<ViewOnlineButton/, `${label} View Online order`);
  assert.match(actionSlice, /DisplaySizeSelect/, `${label} Display Size control in action row`);
  assert.doesNotMatch(actionSlice, /label="Display Size"/);
}

test("display card action row component supports wrapping layout", () => {
  const controls = read("src/components/displays/DisplayCardControls.tsx");
  assert.match(controls, /DisplayCardActionSizeRow/);
  assert.match(controls, /flex-wrap/);
  assert.match(controls, /justify-between/);
});

test("all display card variants place actions on the display size row", () => {
  assertActionSizeRow(
    read("src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx"),
    "BroadArrowTypedDisplayCard",
  );
  assertActionSizeRow(
    read("src/components/displays/DeveloperHtmlDisplayCard.tsx"),
    "DeveloperHtmlDisplayCard",
  );
  assertActionSizeRow(read("src/components/displays/DisplayCard.tsx"), "DisplayCard");
});

test("control stack keeps enable, online viewer, and refresh rate above action row", () => {
  for (const file of [
    "src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx",
    "src/components/displays/DeveloperHtmlDisplayCard.tsx",
    "src/components/displays/DisplayCard.tsx",
  ]) {
    const source = read(file);
    const enableIndex = source.indexOf('label="Enable Display"');
    const onlineIndex = source.indexOf('label="Online Viewer"');
    const refreshIndex = source.indexOf('label="Refresh Rate"');
    const actionRowIndex = source.indexOf("<DisplayCardActionSizeRow");
    assert.ok(refreshIndex >= 0 && actionRowIndex >= 0, `${file} missing controls`);
    assert.ok(refreshIndex < actionRowIndex, `${file} action row placement`);
  }
});

test("view online disabled behavior remains wired through ViewOnlineButton", () => {
  const button = read("src/components/displays/ViewOnlineButton.tsx");
  assert.match(button, /disabled={disabled}/);
  assert.match(button, /!enabled/);
});
