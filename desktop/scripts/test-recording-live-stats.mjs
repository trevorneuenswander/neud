#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("shared live-stats helpers derive duration and never invent disk bytes", () => {
  const {
    elapsedRecordingSeconds,
    formatRecordingByteSize,
    formatRecordingLiveStats,
  } = require(path.join(repoRoot, "shared/output/recording-live-stats.js"));

  const startedAt = new Date(1_700_000_000_000).toISOString();
  assert.equal(elapsedRecordingSeconds(startedAt, 1_700_000_000_000 + 12_500), 12.5);
  assert.equal(elapsedRecordingSeconds(null, Date.now()), 0);
  assert.equal(formatRecordingByteSize(500), "500 B");
  assert.equal(formatRecordingByteSize(2048), "2 KB");
  assert.equal(formatRecordingByteSize(5 * 1024 * 1024), "5 MB");

  const live = formatRecordingLiveStats({
    startedAt,
    byteSize: 0,
    diskBytesPending: true,
    encodedFrames: 90,
    droppedFrames: 1,
    nowMs: 1_700_000_000_000 + 30_000,
  });
  assert.match(live, /^30s · disk buffered · 90 frames · dropped 1$/);

  const withBytes = formatRecordingLiveStats({
    startedAt,
    byteSize: 4096,
    diskBytesPending: false,
    encodedFrames: 10,
    droppedFrames: 0,
    nowMs: 1_700_000_000_000 + 5_000,
  });
  assert.match(withBytes, /^5s · 4 KB · 10 frames · dropped 0$/);
});

test("DiskRecordingService probes neud-partial.mp4 and flags MF buffering", () => {
  const service = read("desktop/src/output/disk-recording-service.ts");
  assert.match(service, /diskBytesPending/);
  assert.match(service, /neud-partial|tempPath/);
  assert.match(service, /startedAt/);
  assert.match(service, /Date\.parse\(session\.startedAt\)/);
});

test("OutputManager refreshes routes while recording and renders live stats", () => {
  const ui = read("src/components/output/OutputManager.tsx");
  assert.match(ui, /formatRecordingLiveStats/);
  assert.match(ui, /hasActiveDiskRecording/);
  assert.match(ui, /setInterval\(tick, 1000\)/);
  assert.match(ui, /onSessionChanged/);
  assert.match(ui, /output-recording-live-stats/);
  assert.doesNotMatch(ui, /Math\.round\(\(route\.recording\.byteSize \?\? 0\) \/ 1024\)\) KB/);
});

test("desktop model re-exports shared live-stats helpers", async () => {
  const dist = path.join(repoRoot, "desktop/dist/output/disk-recording-model.js");
  assert.ok(fs.existsSync(dist), "run desktop build so disk-recording-model.js exists");
  const model = require(dist);
  assert.equal(typeof model.elapsedRecordingSeconds, "function");
  assert.equal(typeof model.formatRecordingLiveStats, "function");
  assert.equal(
    model.formatRecordingLiveStats({
      startedAt: new Date(0).toISOString(),
      byteSize: 0,
      encodedFrames: 3,
      droppedFrames: 0,
      nowMs: 2500,
    }),
    "2s · disk buffered · 3 frames · dropped 0",
  );
});
