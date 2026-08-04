#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dbPath = path.join(os.homedir(), "AppData", "Roaming", "NEUD", "data", "neud.sqlite");
const wasmPath = path.join(repoRoot, "node_modules/sql.js/dist/sql-wasm.wasm");

const SQL = await initSqlJs({
  locateFile: (fileName) =>
    fileName === "sql-wasm.wasm" ? wasmPath : path.join(path.dirname(wasmPath), fileName),
});

const db = new SQL.Database(fs.readFileSync(dbPath));

function query(sql) {
  const result = db.exec(sql);
  return result[0]?.values ?? [];
}

console.info("local_users rows:");
for (const row of query(
  "SELECT id, email, supabase_user_id, platform_role, is_active FROM local_users ORDER BY email",
)) {
  console.info(`  id=${row[0]} email=${row[1]} supabase_user_id=${row[2]} role=${row[3]} active=${row[4]}`);
}

console.info("\nTables referencing user ids (counts):");
for (const [table, column] of [
  ["team_memberships", "user_id"],
  ["project_memberships", "user_id"],
  ["local_project_memberships", "user_id"],
  ["user_display_order", "user_id"],
  ["auth_cache", "user_id"],
]) {
  try {
    const rows = query(`SELECT ${column}, COUNT(*) FROM ${table} GROUP BY ${column}`);
    console.info(`  ${table}.${column}:`, rows.map((r) => `${r[0]}=${r[1]}`).join(", ") || "none");
  } catch (error) {
    console.info(`  ${table}.${column}: unavailable (${error.message})`);
  }
}
