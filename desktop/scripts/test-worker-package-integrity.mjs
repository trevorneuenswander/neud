#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const stagingWorkerRoot = path.join(repoRoot, "desktop", "staging", "worker");
const stageScript = path.join(repoRoot, "desktop", "scripts", "stage-standalone.mjs");
const workerProductionDepsScript = path.join(
  repoRoot,
  "workers",
  "data-engine",
  "scripts",
  "worker-production-deps.mjs",
);

test("stage-standalone stages full worker production dependency tree", () => {
  const source = fs.readFileSync(stageScript, "utf8");
  assert.match(source, /stageWorkerProductionNodeModules/);
  assert.doesNotMatch(
    source,
    /copyRecursive\(fromPath, toPath, "worker"\)/,
    "Worker node_modules must not be copied through filtered recursive copy",
  );
});

test("staged worker includes hoisted transitive production dependencies", () => {
  const cosmiconfigPath = path.join(stagingWorkerRoot, "node_modules", "cosmiconfig", "package.json");
  const browsersPath = path.join(
    stagingWorkerRoot,
    "node_modules",
    "@puppeteer",
    "browsers",
    "lib",
    "esm",
    "browser-data",
    "browser-data.js",
  );

  if (!fs.existsSync(path.join(stagingWorkerRoot, "node_modules", "puppeteer"))) {
    return;
  }

  assert.equal(fs.existsSync(cosmiconfigPath), true, "Missing hoisted cosmiconfig in staged worker");
  assert.equal(fs.existsSync(browsersPath), true, "Missing @puppeteer/browsers browser-data module");
});

test("worker production dependency audit passes for staged worker", () => {
  if (!fs.existsSync(path.join(stagingWorkerRoot, "node_modules", "puppeteer"))) {
    return;
  }

  execSync("node workers/data-engine/scripts/audit-worker-production-deps.mjs", {
    cwd: repoRoot,
    stdio: "pipe",
    env: {
      ...process.env,
      NEUD_STAGING_WORKER_ROOT: stagingWorkerRoot,
    },
  });
});

test("worker production dependency resolver excludes supabase and dev-only packages", () => {
  const source = fs.readFileSync(workerProductionDepsScript, "utf8");
  assert.match(source, /PACKAGED_WORKER_EXCLUDED_PACKAGES[\s\S]*@supabase\/supabase-js/);
  assert.match(source, /DEV_ONLY_PACKAGES[\s\S]*dotenv/);
  assert.match(source, /collectProductionDependencyTree/);
  assert.match(source, /createRequire/);
});
