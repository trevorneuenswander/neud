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

test("hosted displays page uses sortable client with manage permission gate", () => {
  const page = read("src/app/portal/projects/[slug]/displays/page.tsx");
  const client = read("src/components/hosted/HostedProjectDisplaysClient.tsx");
  const queries = read("src/lib/hosted/portal-queries.ts");
  assert.match(page, /HostedProjectDisplaysClient/);
  assert.match(page, /canReorder=\{summary\.canReorder\}/);
  assert.match(queries, /can_operate_project/);
  assert.match(client, /reorderHostedProjectDisplays/);
  assert.match(client, /setDisplays\(previous\)/);
});

test("hosted reorder uses full-card drag activation", () => {
  const client = read("src/components/hosted/HostedProjectDisplaysClient.tsx");
  assert.doesNotMatch(client, /setActivatorNodeRef/);
  assert.doesNotMatch(client, /DisplayDragHandle/);
  assert.match(client, /cursor-grab active:cursor-grabbing/);
  assert.match(client, /previewPaused/);
  assert.match(client, /KeyboardSensor/);
});

test("hosted display order API calls reorder_project_displays RPC", () => {
  const api = read("src/lib/hosted/display-order-api.ts");
  assert.match(api, /reorder_project_displays/);
  assert.match(api, /p_display_ids/);
});

test("hosted display card pauses preview polling while reordering", () => {
  const card = read("src/components/hosted/HostedDisplayCard.tsx");
  assert.match(card, /previewPaused/);
  assert.match(card, /baseStatus\.shouldPollBundle && !previewPaused/);
  assert.match(card, /Preview paused while reordering/);
});
