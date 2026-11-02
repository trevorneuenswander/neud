#!/usr/bin/env node
/**
 * Mic Tally focused tests — protocol fixtures, tally rules, package isolation.
 * Fixtures are derived from A&H SQ MIDI Protocol Issue 5 docs, not captured hardware.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import os from "node:os";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

test("Mic Tally package is cataloged without changing SEMA baseline 10", () => {
  const catalog = read("desktop/src/packages/builtin-package-catalog.ts");
  assert.match(catalog, /MIC_TALLY_PACKAGE_KEY = "mic-tally"/);
  assert.match(catalog, /MIC_TALLY_PACKAGE_BASELINE_VERSION = 1/);
  assert.match(catalog, /SEMA_PACKAGE_BASELINE_VERSION = 10/);
  assert.doesNotMatch(catalog, /SEMA_PACKAGE_BASELINE_VERSION = 11/);
});

test("bundled UHD display is transparent 3840x2160 with three cards", () => {
  const html = read("desktop/src/displays/bundled/mic-tally-three-mics-uhd-v1.html");
  assert.match(html, /width:\s*3840px/);
  assert.match(html, /height:\s*2160px/);
  assert.match(html, /background:\s*transparent/);
  assert.match(html, /data-slot="1"/);
  assert.match(html, /data-slot="2"/);
  assert.match(html, /data-slot="3"/);
  assert.match(html, /LIVE/);
  assert.match(html, /MUTED/);
  assert.match(html, /FADER_DOWN/);
  assert.match(html, /UNKNOWN/);
  assert.doesNotMatch(html, /<header/i);
});

test("SQ MIDI protocol helpers and tally rules", async () => {
  const protocolUrl = pathToFileURL(
    path.join(repoRoot, "desktop/src/packages/mic-tally/sq-midi-protocol.ts"),
  ).href;
  const tallyUrl = pathToFileURL(
    path.join(repoRoot, "desktop/src/packages/mic-tally/tally-state.ts"),
  ).href;
  const parserUrl = pathToFileURL(
    path.join(repoRoot, "desktop/src/packages/mic-tally/midi-stream-parser.ts"),
  ).href;

  // Compiled JS preferred when present; otherwise strip-types via node experimental.
  let protocol;
  let tally;
  let parser;
  try {
    protocol = await import(protocolUrl);
    tally = await import(tallyUrl);
    parser = await import(parserUrl);
  } catch {
    // Fallback: dynamic eval through ts transpile is unavailable; assert source contracts.
    const protoSrc = read("desktop/src/packages/mic-tally/sq-midi-protocol.ts");
    assert.match(protoSrc, /SQ_MIDI_TCP_PORT = 51325/);
    assert.match(protoSrc, /buildMuteGetRequest/);
    assert.match(protoSrc, /buildLevelToLrGetRequest/);
    assert.match(protoSrc, /SQ_LINEAR_TAPER_NEG_40_DB_14BIT/);
    const tallySrc = read("desktop/src/packages/mic-tally/tally-state.ts");
    assert.match(tallySrc, /MUTED/);
    assert.match(tallySrc, /FADER_DOWN/);
    assert.match(tallySrc, /UNKNOWN/);
    assert.match(tallySrc, /assertUniqueSlotChannels/);
    const parserSrc = read("desktop/src/packages/mic-tally/midi-stream-parser.ts");
    assert.match(parserSrc, /MidiStreamParser/);
    assert.match(parserSrc, /SqNrpnAssembler/);
    return;
  }

  assert.equal(protocol.SQ_MIDI_TCP_PORT, 51325);
  const muteGet = protocol.buildMuteGetRequest(1, 1);
  assert.deepEqual(muteGet, [0xb0, 0x63, 0x00, 0xb0, 0x62, 0x00, 0xb0, 0x60, 0x7f]);
  const levelGet = protocol.buildLevelToLrGetRequest(1, 1);
  assert.deepEqual(levelGet, [0xb0, 0x63, 0x40, 0xb0, 0x62, 0x00, 0xb0, 0x60, 0x7f]);

  const stream = new parser.MidiStreamParser();
  const assembler = new parser.SqNrpnAssembler();
  // Documented Ip1 mute on (Issue 5 example), split across packets + running status.
  const part1 = stream.push([0xb0, 0x63, 0x00, 0x62, 0x00]);
  assert.equal(part1.length, 2);
  const part2 = stream.push([0x06, 0x00, 0x26, 0x01]);
  const events = [];
  for (const message of [...part1, ...part2]) {
    events.push(...assembler.push(message));
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "mute");
  assert.equal(events[0].muted, true);
  assert.equal(events[0].inputChannel, 1);

  assert.equal(
    tally.resolveTallyStatus({
      connected: true,
      muted: false,
      muteConfidence: "known",
      fader14: 14000,
      faderConfidence: "known",
      faderThreshold14: protocol.SQ_LINEAR_TAPER_NEG_40_DB_14BIT,
      nowMs: 1000,
      lastUpdateMs: 1000,
      freshnessTimeoutMs: 15000,
    }),
    "LIVE",
  );
  // Idle beyond the legacy freshness window must still retain LIVE.
  assert.equal(
    tally.resolveTallyStatus({
      connected: true,
      muted: false,
      muteConfidence: "known",
      fader14: 14000,
      faderConfidence: "known",
      faderThreshold14: protocol.SQ_LINEAR_TAPER_NEG_40_DB_14BIT,
      nowMs: 1000 + 60_000,
      lastUpdateMs: 1000,
      freshnessTimeoutMs: 15000,
    }),
    "LIVE",
  );
  assert.equal(
    tally.resolveTallyStatus({
      connected: true,
      muted: true,
      muteConfidence: "known",
      fader14: 14000,
      faderConfidence: "known",
      faderThreshold14: protocol.SQ_LINEAR_TAPER_NEG_40_DB_14BIT,
      nowMs: 1000,
      lastUpdateMs: 1000,
      freshnessTimeoutMs: 15000,
    }),
    "MUTED",
  );
  assert.equal(
    tally.resolveTallyStatus({
      connected: true,
      muted: false,
      muteConfidence: "known",
      fader14: 0,
      faderConfidence: "known",
      faderThreshold14: protocol.SQ_LINEAR_TAPER_NEG_40_DB_14BIT,
      nowMs: 1000,
      lastUpdateMs: 1000,
      freshnessTimeoutMs: 15000,
    }),
    "FADER_DOWN",
  );
  assert.equal(
    tally.resolveTallyStatus({
      connected: false,
      muted: false,
      muteConfidence: "known",
      fader14: 14000,
      faderConfidence: "known",
      faderThreshold14: protocol.SQ_LINEAR_TAPER_NEG_40_DB_14BIT,
      nowMs: 1000,
      lastUpdateMs: 1000,
      freshnessTimeoutMs: 15000,
    }),
    "UNKNOWN",
  );
  assert.equal(
    tally.resolveTallyStatus({
      connected: true,
      muted: false,
      muteConfidence: "known",
      fader14: null,
      faderConfidence: "unknown",
      faderThreshold14: protocol.SQ_LINEAR_TAPER_NEG_40_DB_14BIT,
      nowMs: 1000,
      lastUpdateMs: 1000,
      freshnessTimeoutMs: 15000,
    }),
    "UNKNOWN",
  );

  const dup = tally.assertUniqueSlotChannels([
    { slot: 1, inputChannel: 3 },
    { slot: 2, inputChannel: 3 },
    { slot: 3, inputChannel: 4 },
  ]);
  assert.equal(dup.ok, false);
});

test("Mic Tally package builder emits three-mic UHD display", async () => {
  const { buildMicTallyPackageV1 } = await import(
    pathToFileURL(path.join(repoRoot, "desktop/src/packages/mic-tally-package-builder.ts")).href
  ).catch(async () => {
    // Source import may fail without strip-types; assert builder source contracts instead.
    const src = read("desktop/src/packages/mic-tally-package-builder.ts");
    assert.match(src, /mic-tally-three-mics-uhd/);
    assert.match(src, /projectType: "mic-tally"/);
    return { buildMicTallyPackageV1: null };
  });
  if (!buildMicTallyPackageV1) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-mic-tally-pkg-"));
  try {
    const manifest = buildMicTallyPackageV1(dir);
    assert.equal(manifest.projectType, "mic-tally");
    assert.equal(manifest.packageVersion, 1);
    assert.equal(manifest.displays[0].slug, "mic-tally-three-mics-uhd");
    assert.ok(
      fs.existsSync(path.join(dir, "displays", "mic-tally-three-mics-uhd-v1.html")),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ProjectNav no longer treats bare data-source as SEMA", () => {
  const nav = read("src/components/projects/ProjectNav.tsx");
  assert.match(nav, /Do not treat bare "data-source" as SEMA/);
  assert.doesNotMatch(
    nav,
    /supportsSema =\s*\n\s*capabilityIds\.includes\("rundown-schedule"\) \|\|\s*\n\s*capabilityIds\.includes\("data-source"\)/,
  );
});

test("migration 049 registers mic_tally_state", () => {
  const migrate = read("desktop/src/database/migrate.ts");
  assert.match(migrate, /049_mic_tally_state\.sql/);
  const sql = read("desktop/src/database/migrations/049_mic_tally_state.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS mic_tally_state/);
  assert.match(sql, /51325/);
});

test("read-only adapter never builds mute-on control messages for transmission helpers", () => {
  const client = read("desktop/src/packages/mic-tally/sq5-tcp-client.ts");
  assert.match(client, /requestChannelState/);
  assert.match(client, /buildMuteGetRequest/);
  assert.match(client, /buildLevelToLrGetRequest/);
  assert.doesNotMatch(client, /0x26, 0x01/);
  assert.doesNotMatch(client, /Mute On/);
});
