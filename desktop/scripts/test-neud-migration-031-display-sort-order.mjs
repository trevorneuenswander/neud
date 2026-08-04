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

function stripSqlComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

const migration = stripSqlComments(read("supabase/migrations/031_project_display_sort_order.sql"));

test("031 defines reorder_project_displays with project authorization", () => {
  assert.match(migration, /reorder_project_displays/);
  assert.match(migration, /can_operate_project\(p_project_id\)/);
  assert.match(migration, /Duplicate display ids are not allowed/);
  assert.match(migration, /every active project display exactly once/);
  assert.match(migration, /display\.order_changed/);
});

test("031 hardens reorder and list RPC grants", () => {
  assert.match(migration, /revoke execute on function public\.reorder_project_displays\(uuid, uuid\[\]\) from anon/);
  assert.match(
    migration,
    /revoke execute on function public\.reorder_project_displays\(uuid, uuid\[\]\) from service_role/,
  );
  assert.match(migration, /grant execute on function public\.reorder_project_displays\(uuid, uuid\[\]\) to authenticated/);
  assert.match(migration, /order by d\.sort_order nulls last/);
});

test("031 list_project_active_displays returns sort_order", () => {
  assert.match(migration, /sort_order double precision/);
  assert.match(migration, /d\.sort_order/);
});
