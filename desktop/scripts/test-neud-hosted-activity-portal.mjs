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

test("hosted activity page uses full table view with shared ActivityTable", () => {
  const page = read("src/app/portal/activity/page.tsx");
  const view = read("src/components/hosted/HostedActivityFullView.tsx");
  assert.match(page, /HostedActivityFullView/);
  assert.match(view, /ActivityTable/);
  assert.match(view, /ActivityExportButton/);
  assert.doesNotMatch(page, /HostedActivityFeed/);
});

test("hosted activity filters include project, user, event, search, and order", () => {
  const view = read("src/components/hosted/HostedActivityFullView.tsx");
  assert.match(view, /projectFilter/);
  assert.match(view, /actorFilter/);
  assert.match(view, /eventFilter/);
  assert.match(view, /searchText/);
  assert.match(view, /ACTIVITY_ORDER_OPTIONS/);
  assert.match(view, /params\.set\("project"/);
  assert.match(view, /params\.set\("user"/);
  assert.match(view, /params\.set\("event"/);
  assert.match(view, /params\.set\("q"/);
});

test("hosted activity maps internal events to readable labels", () => {
  const view = read("src/components/hosted/HostedActivityFullView.tsx");
  assert.match(view, /Online Viewer enabled/);
  assert.match(view, /Local Controller updated/);
  assert.match(view, /display\.published/);
  assert.doesNotMatch(view, /JSON\.stringify\(event\.metadata/);
});

test("hosted activity CSV export uses filtered rows without sensitive metadata", () => {
  const view = read("src/components/hosted/HostedActivityFullView.tsx");
  const csv = read("src/lib/activity/csv-export.ts");
  const exportButton = read("src/components/activity/ActivityExportButton.tsx");
  assert.match(view, /toHostedCsvRows/);
  assert.match(view, /ActivityExportButton/);
  assert.match(csv, /escapeCsvField/);
  assert.match(csv, /buildActivityCsvFilename/);
  assert.match(exportButton, /disabled=\{disabled \|\| rows\.length === 0\}/);
  assert.doesNotMatch(view, /password/);
  assert.doesNotMatch(view, /token/);
  assert.doesNotMatch(view, /cookie/);
});

test("hosted activity timestamps use shared hosted date/time utilities", () => {
  const view = read("src/components/hosted/HostedActivityFullView.tsx");
  assert.match(view, /formatHostedRelativeTimestamp/);
  assert.match(view, /formatHostedAbsoluteTimestamp/);
});
