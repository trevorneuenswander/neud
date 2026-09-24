#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";

const snapshot = {
  current: { lot: "205", title: "Current Day 2 Lot" },
  next: [
    { lot: "201", title: "A" },
    { lot: "202", title: "B" },
    { lot: "301", title: "C" },
  ],
  lots: [
    { lot: "101", title: "D1" },
    { lot: "102", title: "D1b" },
    { lot: "103", title: "D1c" },
    { lot: "201", title: "D2" },
    { lot: "301", title: "D3" },
  ],
};

test("stream ticker day filter pipeline", async () => {
  const { mapSnapshotToLowerTickerFeed } = await import(
    "../dist/displays/lower-ticker-data.js"
  );
  const normalizePath = new URL(
    "../staging/runtime-assets/display/normalize-display-snapshot.js",
    import.meta.url,
  );
  await import(normalizePath.href);
  const resolveDisplayRuntimeSnapshot = globalThis.resolveDisplayRuntimeSnapshot;
  assert.equal(typeof resolveDisplayRuntimeSnapshot, "function");

  const allFeed = mapSnapshotToLowerTickerFeed(snapshot, { dayFilter: "all" });
  assert.ok(allFeed.next.some((row) => String(row.lot).startsWith("2")));

  const day1Feed = mapSnapshotToLowerTickerFeed(
    {
      lots: snapshot.lots,
      current: { lot: "Lot 102" },
      next: snapshot.next,
    },
    { dayFilter: 1 },
  );
  assert.ok(day1Feed.next.every((row) => String(row.lot).startsWith("1")));
  assert.ok(!day1Feed.next.some((row) => String(row.lot).startsWith("2")));
  const day1End = mapSnapshotToLowerTickerFeed(
    { lots: snapshot.lots, current: { lot: "Lot 103" }, next: [{ lot: "Lot 101" }] },
    { dayFilter: 1 },
  );
  assert.deepEqual(day1End.next, []);

  const bridge = {
    snapshot,
    next: snapshot.next,
    streamTickerFeed: day1Feed,
    broadArrowDisplay: { ticker: day1Feed },
  };
  const runtime = resolveDisplayRuntimeSnapshot(bridge);
  assert.ok(Array.isArray(runtime?.next));
  assert.ok(runtime.next.every((row) => String(row.lot).startsWith("1")));
  assert.strictEqual(runtime.current?.lot, "205");

  const emptyDay3 = mapSnapshotToLowerTickerFeed(
    {
      ...snapshot,
      next: [{ lot: "201", title: "only 2xx" }],
      lots: [
        { lot: "101", title: "D1" },
        { lot: "201", title: "D2" },
      ],
    },
    { dayFilter: 3 },
  );
  assert.deepEqual(emptyDay3.next, []);
});
