#!/usr/bin/env node
/**
 * Read-only probe + apply pending migrations to the live NEUD SQLite file (no reset).
 * Uses the same runMigrations() path as desktop startup.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "..");
const require = createRequire(import.meta.url);
const dbPath = path.join(process.env.APPDATA ?? "", "NEUD", "data", "neud.sqlite");

function wrapSqlJsDb(db) {
  return {
    exec(sql) {
      db.exec(sql);
    },
    prepare(sql) {
      return {
        all(...params) {
          const stmt = db.prepare(sql);
          if (params.length) stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        },
        run(...params) {
          const stmt = db.prepare(sql);
          if (params.length) stmt.bind(params);
          stmt.step();
          stmt.free();
        },
      };
    },
  };
}

function tableColumns(wrapped, table) {
  return wrapped
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => row.name);
}

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  const sqlJsRoot = path.join(repoRoot, "node_modules", "sql.js");
  const initSqlJs = require(sqlJsRoot);
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlJsRoot, "dist", file),
  });

  const bytes = fs.readFileSync(dbPath);
  const db = new SQL.Database(bytes);
  const wrapped = wrapSqlJsDb(db);

  const beforeCols = tableColumns(wrapped, "user_pinned_viewer_preferences");
  const beforeMigrations = wrapped
    .prepare("SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 3")
    .all();
  const prefCount = wrapped.prepare("SELECT COUNT(*) AS count FROM user_pinned_viewer_preferences").all()[0]
    ?.count;

  console.log("BEFORE");
  console.log(JSON.stringify({ dbPath, beforeCols, beforeMigrations, prefCount }, null, 2));

  const { runMigrations } = await import(
    pathToFileURL(path.join(desktopRoot, "dist", "database", "migrate.js")).href,
  );
  runMigrations(wrapped, {
    databaseFile: dbPath,
    backups: path.join(path.dirname(dbPath), "backups"),
  });

  const afterCols = tableColumns(wrapped, "user_pinned_viewer_preferences");
  const afterMigrations = wrapped
    .prepare("SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 3")
    .all();
  const sample = wrapped
    .prepare(
      "SELECT user_id, project_id, pinned_display_ids, pinned_stacks, viewer_height_px, cloud_sync_status FROM user_pinned_viewer_preferences LIMIT 1",
    )
    .all();

  fs.writeFileSync(dbPath, Buffer.from(db.export()));

  console.log("AFTER");
  console.log(JSON.stringify({ afterCols, afterMigrations, sample }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
