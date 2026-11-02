#!/usr/bin/env node
/**
 * Mic Tally Displays list regression.
 *
 * Real failure (project 5eaae95c-8457-4cd4-8d19-c98d4f106d62):
 * hydration/repair persisted mic-tally-three-mics-uhd, local API returned it,
 * but /projects/mic-tally/displays fell through to ProjectPlaceholderPage
 * ("Not configured in this phase") because only SEMA used the package list path.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REAL_MIC_TALLY_PROJECT_ID = "5eaae95c-8457-4cd4-8d19-c98d4f106d62";
const REAL_DISPLAY_KEY = "mic-tally-three-mics-uhd";
const REAL_DISPLAY_NAME = "Mic Tally — Three Microphones UHD";

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

/** Mirrors Displays page buildInstalledPackageDisplayItems join. */
function buildInstalledPackageDisplayItems(input) {
  const developerByKey = new Map(
    input.developerDisplays.map((display) => [display.displayKey, display]),
  );
  return input.displays
    .map((row) => {
      const developerDisplay = developerByKey.get(row.display_key);
      if (!developerDisplay || developerDisplay.archived) {
        return null;
      }
      return {
        kind: "custom",
        id: developerDisplay.displayKey,
        persistId: row.id,
        display: developerDisplay,
      };
    })
    .filter(Boolean);
}

test("Mic Tally Displays route uses package DisplaysPageClient, not placeholder", () => {
  const page = read("src/app/(portal)/projects/[slug]/displays/page.tsx");
  assert.match(page, /projectSupportsMicTallyWorkflow/);
  assert.match(page, /projectSupportsSemaWorkflow/);
  assert.match(page, /buildInstalledPackageDisplayItems/);

  const packageBlockStart = page.indexOf("// Installed package projects");
  assert.ok(packageBlockStart > 0, "installed package Displays path comment missing");
  const packageBlock = page.slice(packageBlockStart);
  assert.match(packageBlock, /projectSupportsMicTallyWorkflow/);
  assert.match(packageBlock, /<DisplaysPageClient/);

  const placeholderReturn = packageBlock.indexOf("return (\n    <ProjectPlaceholderPage");
  const exclusive =
    placeholderReturn > 0 ? packageBlock.slice(0, placeholderReturn) : packageBlock;
  assert.match(exclusive, /projectSupportsMicTallyWorkflow/);
  assert.match(exclusive, /<DisplaysPageClient/);
  assert.doesNotMatch(exclusive, /<ProjectPlaceholderPage/);
});

test("package card join keeps mic-tally-three-mics-uhd when developer row exists", () => {
  const displays = [
    {
      id: "ef437675-663d-44ff-9acb-78edfe5efa99",
      display_key: REAL_DISPLAY_KEY,
      name: REAL_DISPLAY_NAME,
      project_id: REAL_MIC_TALLY_PROJECT_ID,
    },
  ];
  const developerDisplays = [
    {
      id: "ef437675-663d-44ff-9acb-78edfe5efa99",
      displayKey: REAL_DISPLAY_KEY,
      name: REAL_DISPLAY_NAME,
      archived: false,
      sourceType: "project-html",
    },
  ];
  const items = buildInstalledPackageDisplayItems({ displays, developerDisplays });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, REAL_DISPLAY_KEY);
  assert.equal(items[0].persistId, "ef437675-663d-44ff-9acb-78edfe5efa99");
});

test("package card join hides display when developer row missing (previous empty-UI cause)", () => {
  const displays = [
    {
      id: "ef437675-663d-44ff-9acb-78edfe5efa99",
      display_key: REAL_DISPLAY_KEY,
      name: REAL_DISPLAY_NAME,
    },
  ];
  const items = buildInstalledPackageDisplayItems({
    displays,
    developerDisplays: [],
  });
  assert.equal(items.length, 0);
});

test("live NEUD DB Mic Tally project has seeded UHD display when present", () => {
  const dbPath = path.join(
    os.homedir(),
    "Library/Application Support/NEUD/data/neud.sqlite",
  );
  if (!fs.existsSync(dbPath)) {
    // CI / other machines may not have the Owner's local DB.
    return;
  }
  const sql = [
    `SELECT id, slug, project_type FROM projects WHERE id='${REAL_MIC_TALLY_PROJECT_ID}';`,
    `SELECT id, project_id, name, display_key, display_width, display_height, deleted_at FROM displays WHERE project_id='${REAL_MIC_TALLY_PROJECT_ID}' AND display_key='${REAL_DISPLAY_KEY}';`,
    `SELECT display_id, slug, archived, published_revision_id FROM project_display_code WHERE project_id='${REAL_MIC_TALLY_PROJECT_ID}' AND slug='${REAL_DISPLAY_KEY}';`,
  ].join(";\n");
  const result = spawnSync("sqlite3", ["-json", dbPath, sql], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    assert.fail(`sqlite3 failed: ${result.stderr || result.stdout}`);
  }
  // sqlite3 -json with multiple statements returns concatenated JSON arrays.
  const chunks = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < result.stdout.length; i += 1) {
    const ch = result.stdout[i];
    if (ch === "[") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "]") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        chunks.push(JSON.parse(result.stdout.slice(start, i + 1)));
        start = -1;
      }
    }
  }
  const [projects, displays, codeRows] = chunks;
  if (!projects?.length) {
    // Project was removed on this machine — skip rather than fail CI clones.
    return;
  }
  assert.equal(projects[0].project_type, "mic-tally");
  assert.equal(projects[0].slug, "mic-tally");
  assert.equal(displays.length, 1, "expected seeded UHD display row");
  assert.equal(displays[0].name, REAL_DISPLAY_NAME);
  assert.equal(displays[0].display_width, 3840);
  assert.equal(displays[0].display_height, 2160);
  assert.equal(displays[0].deleted_at, null);
  assert.equal(codeRows.length, 1);
  assert.equal(codeRows[0].archived, 0);
  assert.ok(codeRows[0].published_revision_id);

  const items = buildInstalledPackageDisplayItems({
    displays: displays.map((row) => ({
      id: row.id,
      display_key: row.display_key,
      name: row.name,
    })),
    developerDisplays: codeRows.map((row) => ({
      id: row.display_id,
      displayKey: row.slug,
      name: REAL_DISPLAY_NAME,
      archived: row.archived === 1,
      sourceType: "project-html",
    })),
  });
  assert.equal(
    items.length,
    1,
    "Displays page join must yield one visible card for the real Mic Tally project",
  );
});

test("SEMA package baseline remains 10", () => {
  const catalog = read("desktop/src/packages/builtin-package-catalog.ts");
  assert.match(catalog, /SEMA_PACKAGE_BASELINE_VERSION = 10/);
});
