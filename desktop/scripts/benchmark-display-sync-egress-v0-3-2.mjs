#!/usr/bin/env node
/**
 * Local egress model: compare v0.3.1 vs v0.3.2 display-revision pull behavior.
 * Does not hit production Supabase. Uses measured avg HTML size from prod audit (~82 KB).
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AVG_HTML_BYTES = 82_326;
const META_ROW_BYTES = 256; // content_hash metadata row estimate
const DISPLAYS = 18;
const REVISIONS_PER_DISPLAY = 1; // typical synced count near prod (~26 revisions / ~19 displays)

function show(ref, rel) {
  return execSync(`git show ${ref}:${rel}`, { cwd: repoRoot, encoding: "utf8", maxBuffer: 8e6 });
}

function countMatches(text, re) {
  return (text.match(re) || []).length;
}

test("v0.3.2 introduces selective revision metadata path absent from published v0.3.1", () => {
  const v031 = show("e7f792f", "desktop/src/services/display-sync/cloud-display-client.ts");
  const head = fs.readFileSync(
    path.join(repoRoot, "desktop/src/services/display-sync/cloud-display-client.ts"),
    "utf8",
  );
  assert.doesNotMatch(v031, /DISPLAY_REVISION_METADATA_COLUMNS/);
  assert.doesNotMatch(v031, /fetchRevisionMetadataForDisplays/);
  assert.match(head, /DISPLAY_REVISION_METADATA_COLUMNS/);
  assert.match(head, /fetchRevisionMetadataForDisplays/);
  assert.match(head, /fetchRevisionBodiesByIds/);
});

test("v0.3.2 lengthens idle display sync interval 60s → 180s", () => {
  const v031 = show("e7f792f", "desktop/src/services/display-sync/display-sync-service.ts");
  const head = fs.readFileSync(
    path.join(repoRoot, "desktop/src/services/display-sync/display-sync-service.ts"),
    "utf8",
  );
  assert.match(v031, /60_000/);
  assert.match(head, /180_000/);
});

test("egress byte model: idle sync cycles and selective HTML", () => {
  // v0.3.1: each sync cycle pulls full HTML for every revision (historical SELECT * path).
  const v031PerCycleBytes = DISPLAYS * REVISIONS_PER_DISPLAY * AVG_HTML_BYTES;
  const cyclesPerHour031 = 3600 / 60;
  const v031Hourly = v031PerCycleBytes * cyclesPerHour031;
  const v031Monthly = v031Hourly * 24 * 30;

  // v0.3.2 cold start: metadata for all + HTML bodies once.
  const coldMeta = DISPLAYS * REVISIONS_PER_DISPLAY * META_ROW_BYTES;
  const coldBodies = DISPLAYS * REVISIONS_PER_DISPLAY * AVG_HTML_BYTES;
  const coldStart = coldMeta + coldBodies;

  // v0.3.2 warm idle: metadata only when hashes match (no body).
  const warmCycle = DISPLAYS * REVISIONS_PER_DISPLAY * META_ROW_BYTES;
  const cyclesPerHour032 = 3600 / 180;
  const warmHourly = warmCycle * cyclesPerHour032;
  // One cold start/day + warm idle remainder (conservative).
  const v032Monthly = coldStart * 30 + warmHourly * 23 * 30;

  const reductionRatio = 1 - v032Monthly / v031Monthly;

  const report = {
    assumptions: {
      avgHtmlBytes: AVG_HTML_BYTES,
      metaRowBytes: META_ROW_BYTES,
      displays: DISPLAYS,
      revisionsPerDisplay: REVISIONS_PER_DISPLAY,
      note: "Model only — not a production invoice. Assumes selective path used on idle sync.",
    },
    v031: {
      intervalSec: 60,
      bytesPerCycle: v031PerCycleBytes,
      monthlyBytes: v031Monthly,
      monthlyGb: Number((v031Monthly / 1e9).toFixed(2)),
    },
    v032: {
      intervalSec: 180,
      coldStartBytes: coldStart,
      warmBytesPerCycle: warmCycle,
      monthlyBytes: v032Monthly,
      monthlyGb: Number((v032Monthly / 1e9).toFixed(2)),
    },
    projectedReduction: {
      ratio: Number(reductionRatio.toFixed(3)),
      percent: `${(reductionRatio * 100).toFixed(1)}%`,
    },
    fleet: {
      instances1: Number(((v032Monthly * 1) / 1e9).toFixed(2)),
      instances5: Number(((v032Monthly * 5) / 1e9).toFixed(2)),
      instances10: Number(((v032Monthly * 10) / 1e9).toFixed(2)),
    },
  };

  const outDir = path.join(repoRoot, "docs", "alpha-v0.3.2", "rc-validation");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "display-sync-egress-model.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  assert.ok(v032Monthly < v031Monthly * 0.05, "expected >95% model reduction when warm-idle");
  console.log(JSON.stringify(report, null, 2));
});

test("pull path logs selective body fetches", () => {
  const pull = fs.readFileSync(
    path.join(repoRoot, "desktop/src/services/display-sync/display-sync-pull.ts"),
    "utf8",
  );
  assert.match(pull, /pull\.revisions\.selective/);
  assert.match(pull, /bodiesFetched/);
});
