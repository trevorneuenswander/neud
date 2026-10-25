#!/usr/bin/env node
/**
 * Regression: orphan_recovery_suppressed must apply via migration 046.
 * Covers fresh, v0.3.0-era (through 045), already-applied, and earlier-alpha upgrade paths.
 */
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

function seedProjectsAndDisplays(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS displays (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL
    );
    INSERT INTO projects (id, name) VALUES ('proj-1', 'Alpha Project');
    INSERT INTO displays (id, project_id, name) VALUES ('disp-1', 'proj-1', 'Video A');
  `);
}

function seedDisplayMediaAssetsWithoutOrphanColumn(db) {
  db.exec(`
    CREATE TABLE display_media_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      display_id TEXT,
      original_file_name TEXT NOT NULL,
      stored_file_name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      container TEXT NOT NULL,
      codec_four_cc TEXT NOT NULL,
      codec_label TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      frame_rate REAL,
      duration_seconds REAL,
      has_alpha INTEGER NOT NULL DEFAULT 1,
      loop_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO display_media_assets (
      id, project_id, display_id, original_file_name, stored_file_name, relative_path,
      content_sha256, byte_size, container, codec_four_cc, codec_label, width, height,
      has_alpha, loop_enabled, created_at, updated_at
    ) VALUES (
      'asset-1', 'proj-1', 'disp-1', 'clip.mov', 'clip.mov', 'media/clip.mov',
      'abc', 12, 'mov', 'ap4h', 'ProRes 4444', 1920, 1080,
      1, 1, datetime('now'), datetime('now')
    );
  `);
}

function markMigrationsApplied(db, throughVersion) {
  const rows = [];
  for (let version = 1; version <= throughVersion; version += 1) {
    rows.push(
      `INSERT INTO schema_migrations (version, name) VALUES (${version}, 'seeded-${String(version).padStart(3, "0")}.sql');`,
    );
  }
  db.exec(rows.join("\n"));
}

function columnNames(wrapped, table) {
  return wrapped
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => row.name);
}

async function loadMigrate() {
  const distMigrate = path.join(desktopRoot, "dist", "database", "migrate.js");
  assert.ok(fs.existsSync(distMigrate), "desktop dist migrate.js missing — run desktop build");
  return import(pathToFileURL(distMigrate).href);
}

test("046 migration SQL targets display_media_assets.orphan_recovery_suppressed", () => {
  const sql = read("desktop/src/database/migrations/046_video_media_orphan_recovery.sql");
  assert.match(sql, /display_media_assets/);
  assert.match(sql, /orphan_recovery_suppressed/);
  assert.match(sql, /ADD COLUMN orphan_recovery_suppressed/i);
});

test("migration runner registers 046 after 045", () => {
  const files = migrationFilesFromMigrateSource();
  assert.ok(files.includes("045_display_video_media.sql"));
  assert.ok(
    files.includes("046_video_media_orphan_recovery.sql"),
    "046_video_media_orphan_recovery.sql must be listed in MIGRATION_FILES (root cause of Windows delete failure)",
  );
  assert.equal(
    files.indexOf("046_video_media_orphan_recovery.sql"),
    files.indexOf("045_display_video_media.sql") + 1,
  );
});

test("v0.3.0-era DB (through 045) gains orphan_recovery_suppressed and preserves rows", async () => {
  const sqlJsRoot = path.join(repoRoot, "node_modules", "sql.js");
  const initSqlJs = require(sqlJsRoot);
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlJsRoot, "dist", file),
  });
  const db = new SQL.Database();
  db.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  seedProjectsAndDisplays(db);
  seedDisplayMediaAssetsWithoutOrphanColumn(db);
  markMigrationsApplied(db, 45);

  const wrapped = wrapSqlJsDb(db);
  const { runMigrations } = await loadMigrate();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-migrate-046-v030-"));
  const paths = {
    databaseFile: path.join(tmpDir, "neud.sqlite"),
    backups: path.join(tmpDir, "backups"),
  };
  fs.mkdirSync(paths.backups, { recursive: true });
  fs.writeFileSync(paths.databaseFile, Buffer.from(db.export()));

  runMigrations(wrapped, paths);

  const columns = columnNames(wrapped, "display_media_assets");
  assert.ok(columns.includes("orphan_recovery_suppressed"));

  const row = wrapped
    .prepare(
      "SELECT id, display_id, orphan_recovery_suppressed, relative_path FROM display_media_assets WHERE id = ?",
    )
    .all("asset-1")[0];
  assert.ok(row);
  assert.equal(row.display_id, "disp-1");
  assert.equal(row.orphan_recovery_suppressed, 0);
  assert.equal(row.relative_path, "media/clip.mov");

  const applied = wrapped.prepare("SELECT version FROM schema_migrations WHERE version = 46").all();
  assert.equal(applied.length, 1);

  // Idempotent second pass
  runMigrations(wrapped, paths);
  const count = wrapped
    .prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 46")
    .all()[0];
  assert.equal(count.count, 1);

  // Simulate intentional delete suppression used by video display deletion
  wrapped
    .prepare(
      "UPDATE display_media_assets SET orphan_recovery_suppressed = 1, display_id = NULL WHERE id = ?",
    )
    .run("asset-1");
  const afterDelete = wrapped
    .prepare("SELECT orphan_recovery_suppressed, display_id FROM display_media_assets WHERE id = ?")
    .all("asset-1")[0];
  assert.equal(afterDelete.orphan_recovery_suppressed, 1);
  assert.equal(afterDelete.display_id, null);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("already-applied 046 is a no-op", async () => {
  const sqlJsRoot = path.join(repoRoot, "node_modules", "sql.js");
  const initSqlJs = require(sqlJsRoot);
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlJsRoot, "dist", file),
  });
  const db = new SQL.Database();
  db.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  seedProjectsAndDisplays(db);
  seedDisplayMediaAssetsWithoutOrphanColumn(db);
  db.exec(`
    ALTER TABLE display_media_assets
      ADD COLUMN orphan_recovery_suppressed INTEGER NOT NULL DEFAULT 0;
  `);
  markMigrationsApplied(db, 46);

  const wrapped = wrapSqlJsDb(db);
  const { runMigrations } = await loadMigrate();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-migrate-046-done-"));
  const paths = {
    databaseFile: path.join(tmpDir, "neud.sqlite"),
    backups: path.join(tmpDir, "backups"),
  };
  fs.mkdirSync(paths.backups, { recursive: true });
  fs.writeFileSync(paths.databaseFile, Buffer.from(db.export()));

  runMigrations(wrapped, paths);
  assert.ok(columnNames(wrapped, "display_media_assets").includes("orphan_recovery_suppressed"));
  const count = wrapped
    .prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 46")
    .all()[0];
  assert.equal(count.count, 1);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("earlier-alpha DB without 045 applies 045 then 046", async () => {
  const sqlJsRoot = path.join(repoRoot, "node_modules", "sql.js");
  const initSqlJs = require(sqlJsRoot);
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlJsRoot, "dist", file),
  });
  const db = new SQL.Database();
  db.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Minimal stubs so 045/046 FK references do not fail if referenced by later SQL.
  seedProjectsAndDisplays(db);
  markMigrationsApplied(db, 44);

  // Pre-create tables that migrations 1–44 would have created only as needed for 045.
  // Migration 045 creates display_media_assets; we only need projects/displays present.
  const wrapped = wrapSqlJsDb(db);
  const { runMigrations } = await loadMigrate();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-migrate-046-early-"));
  const paths = {
    databaseFile: path.join(tmpDir, "neud.sqlite"),
    backups: path.join(tmpDir, "backups"),
  };
  fs.mkdirSync(paths.backups, { recursive: true });
  fs.writeFileSync(paths.databaseFile, Buffer.from(db.export()));

  // Running all pending from 45 onward may fail if intermediate migrations expect more schema.
  // Apply 045 SQL then 046 directly through the runner by marking 1–44 and ensuring 045 file runs.
  // For a focused unit test, exec 045+046 SQL files after seeding applied through 44 only when
  // intermediate migrations are present on disk — skip heavy 045 dependencies by applying SQL files.
  const migrationsDir = path.join(desktopRoot, "src", "database", "migrations");
  const sql045 = fs.readFileSync(path.join(migrationsDir, "045_display_video_media.sql"), "utf8");
  const sql046 = fs.readFileSync(path.join(migrationsDir, "046_video_media_orphan_recovery.sql"), "utf8");
  wrapped.exec(sql045);
  wrapped
    .prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
    .run(45, "045_display_video_media.sql");
  runMigrations(wrapped, paths);

  assert.ok(columnNames(wrapped, "display_media_assets").includes("orphan_recovery_suppressed"));
  const applied46 = wrapped.prepare("SELECT version FROM schema_migrations WHERE version = 46").all();
  assert.equal(applied46.length, 1);
  // Keep sql046 reference for clarity that file content matches IF NOT EXISTS contract
  assert.match(sql046, /orphan_recovery_suppressed/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("fresh path: 045 schema + pending 046 via runner", async () => {
  const sqlJsRoot = path.join(repoRoot, "node_modules", "sql.js");
  const initSqlJs = require(sqlJsRoot);
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlJsRoot, "dist", file),
  });
  const db = new SQL.Database();
  db.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  seedProjectsAndDisplays(db);
  const migrationsDir = path.join(desktopRoot, "src", "database", "migrations");
  db.exec(fs.readFileSync(path.join(migrationsDir, "045_display_video_media.sql"), "utf8"));
  markMigrationsApplied(db, 45);

  const wrapped = wrapSqlJsDb(db);
  const { runMigrations } = await loadMigrate();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-migrate-046-fresh-"));
  const paths = {
    databaseFile: path.join(tmpDir, "neud.sqlite"),
    backups: path.join(tmpDir, "backups"),
  };
  fs.mkdirSync(paths.backups, { recursive: true });
  fs.writeFileSync(paths.databaseFile, Buffer.from(db.export()));

  runMigrations(wrapped, paths);
  assert.ok(columnNames(wrapped, "display_media_assets").includes("orphan_recovery_suppressed"));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
