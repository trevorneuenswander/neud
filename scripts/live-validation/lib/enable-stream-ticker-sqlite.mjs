#!/usr/bin/env node
/** Diagnostic-only: persist Stream Ticker enabled=true in local SQLite before desktop boot. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dbPath = path.join(os.homedir(), "AppData", "Roaming", "NEUD", "data", "neud.sqlite");
const wasmPath = path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const SQL = await initSqlJs({ locateFile: () => wasmPath });
const db = new SQL.Database(fs.readFileSync(dbPath));
const now = new Date().toISOString();
db.run(
  `INSERT INTO app_settings (key, value_json, updated_at)
   VALUES ('displays.newTickerV1.enabled', 'true', ?)
   ON CONFLICT(key) DO UPDATE SET value_json = 'true', updated_at = excluded.updated_at`,
  [now],
);
db.run(
  `UPDATE displays SET enabled = 1, updated_at = ? WHERE display_key = 'new-ticker-v1'`,
  [now],
);
const verify =
  db.exec(`SELECT value_json FROM app_settings WHERE key = 'displays.newTickerV1.enabled'`)[0]
    ?.values?.[0]?.[0] ?? null;
db.close();
console.log(JSON.stringify({ dbPath, enabledValueJson: verify }, null, 2));
