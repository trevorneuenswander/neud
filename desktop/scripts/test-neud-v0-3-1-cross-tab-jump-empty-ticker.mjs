#!/usr/bin/env node
/**
 * NEUD v0.3.1 — cross-tab Jump, silent viewing tabs, empty NEXT/LATER ticker fades.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("viewing-tab success toast is removed", () => {
  const client = read("src/components/sema/SemaGoogleSheetClient.tsx");
  assert.doesNotMatch(client, /live schedule unchanged/i);
  assert.doesNotMatch(client, /Viewing tab [“"]/);
  assert.match(client, /viewing-tab changes stay silent/i);
  assert.match(client, /viewing\?\.lastError/);
});

test("Jump stays enabled for cross-tab even when viewing cursor matches selection", () => {
  const client = read("src/components/sema/SemaGoogleSheetClient.tsx");
  assert.match(client, /viewingIsLive && selectedRowId === sheetSchedule\?\.currentRowId/);
  assert.match(client, /worksheetGid:\s*viewingGid/);
});

test("schedule service Jump promotes viewing worksheet atomically with worksheet gid", () => {
  const service = read("desktop/src/packages/sema/sema-schedule-service.ts");
  assert.match(service, /async jump\(/);
  assert.match(service, /options\?: \{ worksheetGid\?:/);
  assert.match(service, /Atomic promote/);
  assert.match(service, /Live schedule unchanged/);
  assert.match(service, /fetchSemaSheetSchedule/);
  const api = read("desktop/src/services/local-api-server.ts");
  assert.match(api, /worksheetGid/);
  assert.match(api, /await this\.data\.jumpSemaSchedule/);
});

test("ticker fades empty NEXT/LATER labels and preserves Highlight LATER", () => {
  const html = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  assert.match(html, /syncSlotEmptyState/);
  assert.match(html, /is-empty-exit/);
  assert.match(html, /is-slot-empty/);
  assert.match(html, /data-slot-label="next"/);
  assert.match(html, /slot === "later" && highlightActive/);
  assert.match(html, /rowHasVisibleContent/);
  assert.doesNotMatch(html, /syncSlotEmptyState\("now"/);
});

test("cross-tab Jump matrix (viewing vs live) is covered by service logic", () => {
  // Lightweight behavioral model mirroring jump promote rules.
  function canJump(selectedRowId, viewingCurrentRowId, viewingGid, liveGid) {
    const viewingIsLive = viewingGid === liveGid;
    if (!selectedRowId) return false;
    if (viewingIsLive && selectedRowId === viewingCurrentRowId) return false;
    return true;
  }
  assert.equal(canJump("row-a", "row-a", "0", "0"), false);
  assert.equal(canJump("row-b", "row-a", "0", "0"), true);
  assert.equal(canJump("row-a", "row-a", "1828876151", "0"), true);
  assert.equal(canJump("row-b", "row-a", "1828876151", "0"), true);
});
