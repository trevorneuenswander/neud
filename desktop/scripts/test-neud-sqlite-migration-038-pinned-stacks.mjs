#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function migrationFilesFromMigrateSource() {
  const migrate = read("desktop/src/database/migrate.ts");
  const match = migrate.match(/const MIGRATION_FILES = \[([\s\S]*?)\];/);
  assert.ok(match, "MIGRATION_FILES array not found");
  return [...match[1].matchAll(/"(\d+_[^"]+\.sql)"/g)].map((entry) => entry[1]);
}

test("038 migration SQL adds pinned_stacks with empty-array default", () => {
  const sql = read("desktop/src/database/migrations/038_user_pinned_viewer_stacks.sql");
  assert.match(sql, /user_pinned_viewer_preferences/);
  assert.match(sql, /pinned_stacks/i);
  assert.match(sql, /DEFAULT\s+'\[\]'/i);
});

test("migration runner registers 038 after 037", () => {
  const files = migrationFilesFromMigrateSource();
  assert.ok(files.includes("037_user_pinned_viewer_preferences.sql"));
  assert.ok(files.includes("038_user_pinned_viewer_stacks.sql"));
  assert.equal(files.indexOf("038_user_pinned_viewer_stacks.sql"), files.indexOf("037_user_pinned_viewer_preferences.sql") + 1);
});

test("runtime migration assets include 038", () => {
  const src = path.join(desktopRoot, "src", "database", "migrations", "038_user_pinned_viewer_stacks.sql");
  assert.ok(fs.existsSync(src), "source 038 migration missing");
  const dist = path.join(desktopRoot, "dist", "database", "migrations", "038_user_pinned_viewer_stacks.sql");
  assert.ok(fs.existsSync(dist), "dist 038 migration missing — run desktop build");
  assert.equal(fs.readFileSync(src, "utf8"), fs.readFileSync(dist, "utf8"));
});

function createMigrationTestDb(initSqlJs) {
  const db = new initSqlJs.Database();
  db.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE user_pinned_viewer_preferences (
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      pinned_display_ids TEXT NOT NULL DEFAULT '[]',
      viewer_height_px INTEGER NOT NULL DEFAULT 220,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      cloud_sync_status TEXT NOT NULL DEFAULT 'pending',
      cloud_updated_at TEXT,
      PRIMARY KEY (user_id, project_id)
    );
    INSERT INTO schema_migrations (version, name) VALUES (37, '037_user_pinned_viewer_preferences.sql');
    INSERT INTO user_pinned_viewer_preferences (
      user_id, project_id, pinned_display_ids, viewer_height_px, cloud_sync_status
    ) VALUES (
      'user-a', 'project-a', '["display-1","display-2"]', 492, 'synced'
    );
  `);
  return db;
}

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

test("037-era DB upgrades to 038 and preserves pinned preference rows", async () => {
  const sqlJsRoot = path.join(repoRoot, "node_modules", "sql.js");
  const initSqlJs = require(sqlJsRoot);
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlJsRoot, "dist", file),
  });
  const db = createMigrationTestDb(SQL);
  const wrapped = wrapSqlJsDb(db);

  const { runMigrations } = await import(
    pathToFileURL(path.join(desktopRoot, "dist", "database", "migrate.js")).href,
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-migrate-038-"));
  const backupsDir = path.join(tmpDir, "backups");
  fs.mkdirSync(backupsDir, { recursive: true });
  const paths = {
    databaseFile: path.join(tmpDir, "neud.sqlite"),
    backups: backupsDir,
  };
  fs.writeFileSync(paths.databaseFile, Buffer.from(db.export()));

  runMigrations(wrapped, paths);

  const columns = wrapped
    .prepare("PRAGMA table_info(user_pinned_viewer_preferences)")
    .all()
    .map((row) => row.name);
  assert.ok(columns.includes("pinned_stacks"));

  const row = wrapped
    .prepare(
      "SELECT pinned_display_ids, pinned_stacks, viewer_height_px, cloud_sync_status FROM user_pinned_viewer_preferences WHERE user_id = ?",
    )
    .all("user-a")[0];
  assert.ok(row, "expected seeded pinned preference row after migration");
  assert.equal(row.pinned_display_ids, '["display-1","display-2"]');
  assert.equal(row.pinned_stacks, "[]");
  assert.equal(row.viewer_height_px, 492);
  assert.equal(row.cloud_sync_status, "synced");

  const applied = wrapped.prepare("SELECT version FROM schema_migrations WHERE version = 38").all();
  assert.equal(applied.length, 1);

  runMigrations(wrapped, paths);
  const appliedTwice = wrapped
    .prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 38")
    .all()[0];
  assert.equal(appliedTwice.count, 1);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("user pinned viewer repository reads pinned_stacks after upgrade", () => {
  const repo = read("desktop/src/repositories/user-pinned-viewer-repository.ts");
  assert.match(repo, /pinned_stacks/);
  assert.match(repo, /pinnedStacks/);
});

test("local data service stack mutations use pinnedStacks column", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /pinnedStacks/);
  assert.match(service, /addPinnedDisplayToStack/);
});
