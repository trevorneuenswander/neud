#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("hosted drag handle disables native HTML5 draggable for dnd-kit mode", () => {
  const handle = read("src/components/displays/DisplayDragHandle.tsx");
  const hosted = read("src/components/hosted/HostedProjectDisplaysClient.tsx");
  assert.match(handle, /dragImplementation\?: "dnd-kit" \| "native"/);
  assert.match(handle, /draggable=\{useNativeDrag \? !disabled : false\}/);
  assert.match(hosted, /dragImplementation="dnd-kit"/);
});

test("viewer role cannot reorder hosted displays through portal query gate", () => {
  const queries = read("src/lib/hosted/portal-queries.ts");
  assert.match(queries, /canReorder: Boolean\(canOperate\)/);
  assert.match(queries, /can_operate_project/);
});

test("desktop display reorder requires operator capability", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /capabilities\.canOperateDisplays/);
});

test("reorder RPC requires complete active display list", () => {
  const migration = read("supabase/migrations/031_project_display_sort_order.sql");
  assert.match(migration, /reorder_project_displays/);
  assert.match(migration, /array_length\(p_display_ids/);
});
