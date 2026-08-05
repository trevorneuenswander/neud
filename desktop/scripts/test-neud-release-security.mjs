#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  SEEDED_SERVICE_ROLE_SECRET,
  extractAsar,
  findReleaseRoots,
  scanDirectory,
} from "./lib/release-security-scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const workerLocalDist = path.join(repoRoot, "workers", "data-engine", "dist-local");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function buildDesktopIfNeeded() {
  execSync("npm run build -w @neud/desktop", {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function buildStagingIfNeeded() {
  const stagedIndex = path.join(desktopRoot, "staging", "worker", "dist", "index.js");
  const stagedSupabase = path.join(desktopRoot, "staging", "worker", "dist", "supabase.js");
  if (fs.existsSync(stagedIndex) && !fs.existsSync(stagedSupabase)) {
    return;
  }
  execSync("npm run build:web", { cwd: repoRoot, stdio: "inherit" });
  execSync("node desktop/scripts/stage-standalone.mjs", {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function buildReleaseIfRequested() {
  if (process.env.NEUD_BUILD_RELEASE !== "1") {
    return false;
  }
  execSync("npm run build:desktop", { cwd: repoRoot, stdio: "inherit" });
  execSync("npm run package:win -w @neud/desktop", {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  });
  return true;
}

test("local worker dist excludes privileged supabase adapter", () => {
  buildDesktopIfNeeded();
  assert.equal(fs.existsSync(path.join(workerLocalDist, "index.js")), true);
  assert.equal(fs.existsSync(path.join(workerLocalDist, "supabase.js")), false);
  assert.match(read("workers/data-engine/dist-local/cloud-client.js"), /not available in the NEUD local Data Engine worker/);
});

test("remote worker retains supabase adapter separately from local dist", () => {
  assert.equal(fs.existsSync(path.join(repoRoot, "workers/data-engine/dist/supabase.js")), true);
  assert.equal(fs.existsSync(path.join(workerLocalDist, "supabase.js")), false);
});

test("staged desktop worker uses local dist without privileged adapter", () => {
  buildStagingIfNeeded();
  const stagedWorkerDist = path.join(desktopRoot, "staging", "worker", "dist");
  assert.equal(fs.existsSync(path.join(stagedWorkerDist, "index.js")), true);
  assert.equal(fs.existsSync(path.join(stagedWorkerDist, "supabase.js")), false);
  assert.equal(fs.existsSync(path.join(desktopRoot, "staging", "worker", "node_modules", "@supabase")), false);
});

test("desktop source cannot import trusted server admin modules", () => {
  const violations = [];
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".ts")) {
        files.push(fullPath);
      }
    }
  }

  walk(path.join(desktopRoot, "src"));

  for (const filePath of files) {
    const contents = fs.readFileSync(filePath, "utf8");
    if (/@\/lib\/supabase\/admin|createAdminClient|loadServerConfig|getSupabaseMain/.test(contents)) {
      violations.push(path.relative(repoRoot, filePath));
    }
  }

  assert.deepEqual(violations, []);
});

test("compiled desktop main starts without service-role dependency", () => {
  buildDesktopIfNeeded();
  const main = read("desktop/dist/main.js");
  assert.doesNotMatch(main, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(main, /loadServerConfig/);
  assert.doesNotMatch(main, /getSupabaseMain/);
  assert.match(main, /loadSupabasePublicConfig/);
});

test("desktop dist and staged local worker pass release security scan", () => {
  buildDesktopIfNeeded();
  buildStagingIfNeeded();

  const roots = [
    path.join(desktopRoot, "dist"),
    path.join(desktopRoot, "staging", "worker"),
  ];

  for (const root of roots) {
    const findings = scanDirectory(root, { seededSecret: SEEDED_SERVICE_ROLE_SECRET });
    assert.deepEqual(
      findings,
      [],
      `release scan findings under ${path.relative(repoRoot, root)}: ${JSON.stringify(findings.slice(0, 5), null, 2)}`,
    );
  }
});

test("packaged release output passes release security scan when present", async () => {
  buildDesktopIfNeeded();
  buildStagingIfNeeded();

  if (process.env.NEUD_BUILD_RELEASE === "1") {
    buildReleaseIfRequested();
  }

  const scanRoots = [
    path.join(desktopRoot, "staging", "worker"),
  ];

  if (process.env.NEUD_BUILD_RELEASE === "1") {
    for (const root of findReleaseRoots(desktopRoot)) {
      if (root.includes("win-unpacked")) {
        scanRoots.push(root);
      }
    }
  }

  assert.ok(scanRoots.some((root) => fs.existsSync(root)), "expected worker staging or release output to scan");

  for (const root of scanRoots) {
    if (!fs.existsSync(root)) continue;

    const asarPath = path.join(root, "resources", "app.asar");
    if (fs.existsSync(asarPath)) {
      const extractDir = path.join(desktopRoot, ".release-scan", path.basename(root));
      fs.rmSync(extractDir, { recursive: true, force: true });
      await extractAsar(asarPath, extractDir);
      const findings = scanDirectory(extractDir, { seededSecret: SEEDED_SERVICE_ROLE_SECRET });
      assert.deepEqual(findings, [], `app.asar findings: ${JSON.stringify(findings.slice(0, 5), null, 2)}`);
    }

    const findings = scanDirectory(root, { seededSecret: SEEDED_SERVICE_ROLE_SECRET });
    assert.deepEqual(
      findings,
      [],
      `release findings under ${path.relative(repoRoot, root)}: ${JSON.stringify(findings.slice(0, 5), null, 2)}`,
    );
  }
});

test("packaged worker entry resolves to local dist path", () => {
  const appPaths = read("desktop/src/services/app-paths.ts");
  assert.match(appPaths, /staging", "worker", "dist", "boot\.js"/);
  assert.doesNotMatch(appPaths, /staging", "worker", "src", "index\.js"/);
});

test("migration 020 allows authenticated owner project registration", () => {
  const migration = read("supabase/migrations/020_owner_project_registration.sql");
  assert.match(migration, /registered_by_user_id/);
  assert.doesNotMatch(migration, /Only platform administrators may register new hosted projects/);
  assert.match(migration, /grant execute on function public\.register_hosted_project_for_desktop/);
});
