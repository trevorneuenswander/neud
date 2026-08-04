#!/usr/bin/env node
/**
 * One-time local migration helper for NEUD rename rollout.
 * Copies only data/config from legacy folders when NEUD is empty, then renames hmg-graphics.sqlite -> neud.sqlite.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const appDataRoot = process.env.APPDATA;
if (!appDataRoot) {
  console.error("APPDATA is unavailable.");
  process.exit(1);
}

const NEUD_ROOT = path.join(appDataRoot, "NEUD");
const LEGACY_SOURCES = [
  path.join(appDataRoot, "Electron"),
  path.join(appDataRoot, "HMG Graphics Server"),
  path.join(appDataRoot, "hmg-graphics-server"),
];

function copyIfMissing(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) {
    return false;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function copyLegacyDataIfNeeded() {
  fs.mkdirSync(path.join(NEUD_ROOT, "data"), { recursive: true });
  fs.mkdirSync(path.join(NEUD_ROOT, "config"), { recursive: true });

  let copied = 0;
  for (const legacyRoot of LEGACY_SOURCES) {
    if (!fs.existsSync(legacyRoot)) continue;

    const candidates = [
      ["data/hmg-graphics.sqlite", "data/hmg-graphics.sqlite"],
      ["data/neud.sqlite", "data/neud.sqlite"],
      ["config/local-api-session.json", "config/local-api-session.json"],
      ["config/host.json", "config/host.json"],
      ["config/auth-cache.enc", "config/auth-cache.enc"],
    ];

    for (const [relativeSource, relativeTarget] of candidates) {
      if (
        copyIfMissing(
          path.join(legacyRoot, relativeSource),
          path.join(NEUD_ROOT, relativeTarget),
        )
      ) {
        copied += 1;
      }
    }
  }

  if (copied > 0) {
    console.info(`[UserDataMigration] copied=${copied} target=NEUD`);
  }
}

function migrateDatabaseFilename() {
  const dataDir = path.join(NEUD_ROOT, "data");
  const backupsDir = path.join(dataDir, "backups");
  const legacyPath = path.join(dataDir, "hmg-graphics.sqlite");
  const targetPath = path.join(dataDir, "neud.sqlite");

  if (fs.existsSync(targetPath)) {
    console.info(`[DatabaseRename] target already exists: ${targetPath}`);
    return { backupPath: null, targetPath };
  }

  if (!fs.existsSync(legacyPath)) {
    console.info("[DatabaseRename] no legacy database to rename.");
    return { backupPath: null, targetPath: null };
  }

  fs.mkdirSync(backupsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    backupsDir,
    `pre-rename-hmg-graphics.sqlite-${timestamp}.sqlite`,
  );

  fs.copyFileSync(legacyPath, backupPath);
  fs.copyFileSync(legacyPath, targetPath);

  const legacySize = fs.statSync(legacyPath).size;
  const targetSize = fs.statSync(targetPath).size;
  if (legacySize !== targetSize) {
    fs.unlinkSync(targetPath);
    throw new Error("Database rename failed size verification.");
  }

  fs.unlinkSync(legacyPath);
  console.info(
    `[DatabaseRename] source=hmg-graphics.sqlite target=neud.sqlite status=success backup=${backupPath}`,
  );

  return { backupPath, targetPath };
}

copyLegacyDataIfNeeded();
const result = migrateDatabaseFilename();
console.info(JSON.stringify({ neudRoot: NEUD_ROOT, ...result }, null, 2));
