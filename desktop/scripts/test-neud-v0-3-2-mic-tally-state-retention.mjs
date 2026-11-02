#!/usr/bin/env node
/**
 * Mic Tally state retention: idle MIDI silence must not force UNKNOWN.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

const tallyPath = path.join(
  repoRoot,
  "desktop/src/packages/mic-tally/tally-state.ts",
);

async function loadTally() {
  return import(pathToFileURL(tallyPath).href);
}

const THRESHOLD = 10447;

function baseKnown(overrides = {}) {
  return {
    connected: true,
    muted: false,
    muteConfidence: "known",
    fader14: 14000,
    faderConfidence: "known",
    faderThreshold14: THRESHOLD,
    nowMs: 1_000_000,
    lastUpdateMs: 1_000,
    freshnessTimeoutMs: 15_000,
    ...overrides,
  };
}

test("LIVE remains LIVE after prolonged idle (fake clock beyond freshness window)", async () => {
  const tally = await loadTally();
  assert.equal(
    tally.resolveTallyStatus(
      baseKnown({
        nowMs: 1_000 + 15_000 + 1,
        lastUpdateMs: 1_000,
        freshnessTimeoutMs: 15_000,
      }),
    ),
    "LIVE",
  );
  assert.equal(
    tally.resolveTallyStatus(
      baseKnown({
        nowMs: 1_000 + 60 * 60 * 1000,
        lastUpdateMs: 1_000,
        freshnessTimeoutMs: 15_000,
      }),
    ),
    "LIVE",
  );
});

test("MUTED remains MUTED after prolonged idle", async () => {
  const tally = await loadTally();
  assert.equal(
    tally.resolveTallyStatus(
      baseKnown({
        muted: true,
        nowMs: 1_000 + 120_000,
        lastUpdateMs: 1_000,
        freshnessTimeoutMs: 15_000,
      }),
    ),
    "MUTED",
  );
});

test("FADER_DOWN remains FADER_DOWN after prolonged idle", async () => {
  const tally = await loadTally();
  assert.equal(
    tally.resolveTallyStatus(
      baseKnown({
        fader14: 0,
        nowMs: 1_000 + 120_000,
        lastUpdateMs: 1_000,
        freshnessTimeoutMs: 15_000,
      }),
    ),
    "FADER_DOWN",
  );
});

test("No MIDI traffic does not invalidate known synchronized state", async () => {
  const tally = await loadTally();
  const src = read("desktop/src/packages/mic-tally/tally-state.ts");
  assert.match(src, /Intentionally ignore freshnessTimeoutMs/);
  assert.equal(
    tally.resolveTallyStatus(
      baseKnown({
        nowMs: Number.MAX_SAFE_INTEGER,
        lastUpdateMs: 0,
        freshnessTimeoutMs: 1,
      }),
    ),
    "LIVE",
  );
});

test("Unsynchronized connected channel stays UNKNOWN; disconnected forces UNKNOWN", async () => {
  const tally = await loadTally();
  assert.equal(
    tally.resolveTallyStatus(
      baseKnown({
        muteConfidence: "unknown",
        muted: null,
        lastUpdateMs: null,
      }),
    ),
    "UNKNOWN",
  );
  assert.equal(
    tally.resolveTallyStatus(baseKnown({ connected: false })),
    "UNKNOWN",
  );
  assert.equal(tally.channelIsSynchronized(baseKnown()), true);
  assert.equal(
    tally.channelIsSynchronized({
      muted: null,
      muteConfidence: "unknown",
      fader14: 14000,
      faderConfidence: "known",
    }),
    false,
  );
});

test("Service retains known state wording and exposes diagnostic timestamps", () => {
  const service = read("desktop/src/packages/mic-tally/mic-tally-service.ts");
  assert.match(service, /lastMidiReceivedAt/);
  assert.match(service, /lastStateUpdateAt/);
  assert.match(service, /stateRetention: "retain-known-while-connected"/);
  assert.match(service, /invalidateAllChannels/);
  // Scene path still invalidates then refreshes.
  assert.match(service, /Scene \$\{event\.sceneNumber\} recalled/);
  assert.match(service, /syncSelectedChannels/);
});

test("Data Source awaiting label requires missing mute/fader, not idle age", () => {
  const client = read("src/components/mic-tally/MicTallyDataSourceClient.tsx");
  assert.match(client, /slot\.muted == null \|\| slot\.fader14 == null/);
  assert.match(client, /Last MIDI received/);
  assert.match(client, /Last channel-state update|Last state update/);
  assert.match(client, /Last mixer health response/);
  assert.match(client, /Idle MIDI silence does not clear synchronized/);
});

test("SEMA baseline remains 10", () => {
  const catalog = read("desktop/src/packages/builtin-package-catalog.ts");
  assert.match(catalog, /SEMA_PACKAGE_BASELINE_VERSION = 10/);
});
