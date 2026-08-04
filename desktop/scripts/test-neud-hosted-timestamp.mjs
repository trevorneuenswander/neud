#!/usr/bin/env node
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const modulePath = pathToFileURL(
  path.join(repoRoot, "src/lib/hosted/format-hosted-timestamp.ts"),
).href;

const {
  formatHostedRelativeTimestamp,
  formatHostedAbsoluteTimestamp,
} = await import(modulePath);

test("parses Z and +00:00 Supabase timestamps as UTC", () => {
  const z = "2026-07-21T18:00:00Z";
  const offset = "2026-07-21T18:00:00+00:00";
  const nowMs = Date.parse("2026-07-21T19:00:00Z");

  assert.equal(formatHostedRelativeTimestamp(z, nowMs), "1 hour ago");
  assert.equal(formatHostedRelativeTimestamp(offset, nowMs), "1 hour ago");
  assert.match(formatHostedAbsoluteTimestamp(z) ?? "", /2026/);
});

test("timestamps without timezone suffix are treated as UTC", () => {
  const value = "2026-07-21T18:00:00";
  const nowMs = Date.parse("2026-07-21T18:30:00Z");
  assert.equal(formatHostedRelativeTimestamp(value, nowMs), "30 minutes ago");
});

test("small future skew clamps to Just now", () => {
  const value = "2026-07-21T18:00:30Z";
  const nowMs = Date.parse("2026-07-21T18:00:00Z");
  assert.equal(formatHostedRelativeTimestamp(value, nowMs), "Just now");
});

test("truly future timestamps are labeled clearly", () => {
  const value = "2026-07-21T20:00:00Z";
  const nowMs = Date.parse("2026-07-21T18:00:00Z");
  assert.match(formatHostedRelativeTimestamp(value, nowMs), /^Scheduled /);
});

test("fractional seconds parse correctly", () => {
  const value = "2026-07-21T18:00:00.123Z";
  const nowMs = Date.parse("2026-07-21T18:05:00Z");
  assert.equal(formatHostedRelativeTimestamp(value, nowMs), "4 minutes ago");
});
