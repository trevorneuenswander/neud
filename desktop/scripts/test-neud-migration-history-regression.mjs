#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { migrationChecksum } from "../../scripts/live-validation/lib/migrations.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const MIGRATION_029 = "029_list_project_active_displays.sql";
const MIGRATION_030 = "030_harden_project_active_displays.sql";
const LIVE_APPLIED_029_CHECKSUM =
  "37c38c4b757d1099b1113ca17f1a8da7a059e80c24ad8b4d283f20287eaf2d8b";

function readMigration(fileName) {
  return fs.readFileSync(path.join(repoRoot, "supabase", "migrations", fileName), "utf8");
}

function simulateApplyMigrationFile(existingMigrations, fileName, sql) {
  const checksum = migrationChecksum(sql);
  const existing = existingMigrations.find((entry) => entry.migration_name === fileName);

  if (existing?.checksum === checksum) {
    return {
      fileName,
      ok: true,
      skipped: true,
      checksum,
      note: "Already applied with matching checksum",
    };
  }

  if (existing && existing.checksum !== checksum) {
    throw new Error(
      `${fileName} was previously applied with a different checksum. Restore database before retrying.`,
    );
  }

  existingMigrations.push({
    migration_name: fileName,
    checksum,
    applied_at: new Date().toISOString(),
  });

  return {
    fileName,
    ok: true,
    skipped: false,
    checksum,
  };
}

test("restored local 029 checksum matches live applied checksum", () => {
  const checksum = migrationChecksum(readMigration(MIGRATION_029));
  assert.equal(checksum, LIVE_APPLIED_029_CHECKSUM);
});

test("unchanged 029 is skipped when already applied with original checksum", () => {
  const tracked = [
    {
      migration_name: MIGRATION_029,
      checksum: LIVE_APPLIED_029_CHECKSUM,
    },
  ];

  const result = simulateApplyMigrationFile(tracked, MIGRATION_029, readMigration(MIGRATION_029));
  assert.equal(result.skipped, true);
  assert.equal(tracked.length, 1);
});

test("030 applies after 029 is already tracked", () => {
  const tracked = [
    {
      migration_name: MIGRATION_029,
      checksum: LIVE_APPLIED_029_CHECKSUM,
    },
  ];

  const result = simulateApplyMigrationFile(tracked, MIGRATION_030, readMigration(MIGRATION_030));
  assert.equal(result.skipped, false);
  assert.equal(tracked.length, 2);
  assert.equal(tracked[1].migration_name, MIGRATION_030);
});

test("modifying 029 after apply still triggers checksum failure", () => {
  const tracked = [
    {
      migration_name: MIGRATION_029,
      checksum: LIVE_APPLIED_029_CHECKSUM,
    },
  ];

  const modifiedSql = `${readMigration(MIGRATION_029)}\n-- post-apply edit`;
  assert.throws(
    () => simulateApplyMigrationFile(tracked, MIGRATION_029, modifiedSql),
    /was previously applied with a different checksum/,
  );
});

test("migration runner keeps checksum mismatch as a hard failure", () => {
  const migrationsLib = fs.readFileSync(
    path.join(repoRoot, "scripts/live-validation/lib/migrations.mjs"),
    "utf8",
  );
  assert.match(migrationsLib, /if \(existing && existing\.checksum !== checksum\)/);
  assert.match(migrationsLib, /was previously applied with a different checksum/);
  assert.match(migrationsLib, /throw new Error/);
});
