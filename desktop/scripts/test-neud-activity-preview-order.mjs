#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  selectNewestActivityEvents,
  sortActivityEventsNewestFirst,
} from "../../scripts/live-validation/lib/activity-sort.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function makeEvent(id, createdAt) {
  return { id, createdAt };
}

test("compact preview shows newest event first", () => {
  const events = [
    makeEvent("a", "2026-01-01T10:00:00.000Z"),
    makeEvent("c", "2026-01-01T12:00:00.000Z"),
    makeEvent("b", "2026-01-01T11:00:00.000Z"),
  ];
  const compact = selectNewestActivityEvents(events, 50);
  assert.equal(compact[0]?.id, "c");
  assert.equal(compact.at(-1)?.id, "a");
});

test("hosted dashboard preview uses shared newest-first selector", () => {
  const hostedDashboard = read("src/components/hosted/HostedPortalDashboardClient.tsx");
  const normalize = read("src/lib/activity/normalize.ts");
  assert.match(hostedDashboard, /CompactActivityTable/);
  assert.match(normalize, /selectNewestActivityEvents/);
  assert.match(normalize, /selectCompactActivityEvents/);
});

test("desktop dashboard preview uses shared newest-first selector", () => {
  const dashboard = read("src/components/dashboard/DashboardActivityClient.tsx");
  const desktopData = read("desktop/src/services/local-data-service.ts");
  const desktopDisplay = read("desktop/src/services/activity-display.ts");
  assert.match(dashboard, /CompactActivityTable/);
  assert.match(dashboard, /normalizeActivityEventsForProjects/);
  assert.match(desktopData, /selectCompactActivityEvents/);
  assert.match(desktopDisplay, /selectNewestActivityEvents/);
});

test("sorting happens before row limiting", () => {
  const events = Array.from({ length: 60 }, (_, index) =>
    makeEvent(`event-${index}`, new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()),
  );
  const compact = selectNewestActivityEvents(events, 50);
  assert.equal(compact.length, 50);
  assert.equal(compact[0]?.id, "event-59");
  assert.equal(compact.at(-1)?.id, "event-10");
});

test("equal timestamps have deterministic ordering by id", () => {
  const timestamp = "2026-01-01T12:00:00.000Z";
  const events = [
    makeEvent("event-b", timestamp),
    makeEvent("event-a", timestamp),
    makeEvent("event-c", timestamp),
  ];
  const sorted = sortActivityEventsNewestFirst(events);
  assert.deepEqual(sorted.map((event) => event.id), ["event-c", "event-b", "event-a"]);
});

test("input activity array is not mutated", () => {
  const events = [
    makeEvent("old", "2026-01-01T10:00:00.000Z"),
    makeEvent("new", "2026-01-01T12:00:00.000Z"),
  ];
  const sourceCopy = structuredClone(events);
  sortActivityEventsNewestFirst(events);
  assert.deepEqual(events, sourceCopy);
});

test("full Activity page remains unchanged", () => {
  const fullView = read("src/components/activity/ActivityFullView.tsx");
  assert.match(fullView, /ACTIVITY_ORDER_OPTIONS/);
  assert.match(fullView, /order === "newest-first" \? normalized : \[\.\.\.normalized\]\.reverse\(\)/);
  assert.doesNotMatch(fullView, /selectCompactActivityEvents/);
});

test("full Activity page order filter still works", () => {
  const panel = read("src/lib/projects/activity-panel.ts");
  assert.match(panel, /orderActivityEntries/);
  assert.match(panel, /oldest-first/);
  assert.match(panel, /newest-first/);
});

test("portal and desktop previews share the same ordering helper", () => {
  for (const relativePath of [
    "src/lib/activity/sort.ts",
    "desktop/src/lib/activity/sort.ts",
  ]) {
    const source = read(relativePath);
    assert.match(source, /sortActivityEventsNewestFirst/);
    assert.match(source, /selectNewestActivityEvents/);
  }
  for (const relativePath of [
    "src/lib/activity/normalize.ts",
    "desktop/src/services/activity-display.ts",
  ]) {
    const source = read(relativePath);
    assert.match(source, /selectNewestActivityEvents/);
    assert.match(source, /selectCompactActivityEvents/);
  }
});

test("compact preview scroll pins to top for newest-first rows", () => {
  const table = read("src/components/activity/CompactActivityTable.tsx");
  const feed = read("src/components/activity/CompactActivityFeed.tsx");
  assert.match(table, /scrollActivityToTop/);
  assert.match(table, /isNearActivityTop/);
  assert.match(feed, /scrollActivityToTop/);
  assert.match(feed, /isNearActivityTop/);
  assert.doesNotMatch(table, /scrollActivityToBottom/);
});
