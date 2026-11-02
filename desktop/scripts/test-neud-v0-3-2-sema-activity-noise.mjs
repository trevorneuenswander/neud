#!/usr/bin/env node
/**
 * v0.3.2 — Routine SEMA ops must not create cloud-synced Activity entries.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

test("routine SEMA schedule/Highlight ops use local diagnostics instead of recordActivity", () => {
  const local = read("desktop/src/services/local-data-service.ts");
  const diagnostics = read("desktop/src/services/runtime-diagnostics-log.ts");

  assert.match(diagnostics, /export function appendSemaOpsLog/);
  assert.match(local, /appendSemaOpsLog/);

  for (const noise of [
    "SEMA schedule moved to the next row.",
    "SEMA schedule moved to the previous row.",
    "SEMA schedule jumped to a selected row.",
    "SEMA ticker Highlight activated.",
    "SEMA ticker Highlight removed from air.",
    "SEMA ticker Highlight cleared.",
    "SEMA Manual Controller Now / Next / Later values saved.",
  ]) {
    assert.doesNotMatch(
      local,
      new RegExp(`recordActivity\\([\\s\\S]*?${noise.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `expected no recordActivity for: ${noise}`,
    );
    assert.doesNotMatch(local, new RegExp(`message:\\s*"${noise.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }

  // Meaningful SEMA admin events remain Activity.
  assert.match(local, /SEMA Google Sheet URL configuration updated/);
  assert.match(local, /SEMA on-air source switched/);
});

test("appendSemaOpsLog writes only to local logs path (no activity sync)", () => {
  const diagnostics = read("desktop/src/services/runtime-diagnostics-log.ts");
  assert.match(diagnostics, /sema-ops\.log/);
  assert.doesNotMatch(diagnostics, /queueEventUpload/);
  assert.doesNotMatch(diagnostics, /activity_events/);
});
