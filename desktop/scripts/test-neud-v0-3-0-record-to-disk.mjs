/**
 * Record-to-Disk wiring and model assertions (no hardware / real-media claim).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(root, "desktop");
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("disk recording model exports formats and collision-safe naming", async () => {
  const modelPath = path.join(desktopRoot, "src/output/disk-recording-model.ts");
  assert.ok(fs.existsSync(modelPath));
  const source = read("desktop/src/output/disk-recording-model.ts");
  assert.match(source, /prores-4444-mov/);
  assert.match(source, /prores-422hq-mov/);
  assert.match(source, /h264-mp4/);
  assert.match(source, /NEUD_\$\{project\}_\$\{output\}_\$\{stamp\}/);
  assert.match(source, /24000, denominator: 1001/);
  const { buildPartialRecordingPath } = require(
    path.join(desktopRoot, "dist/output/disk-recording-model.js"),
  );
  const partial = buildPartialRecordingPath("/tmp/NEUD_Demo_Record_2026-01-01_12-00-00.mp4");
  assert.equal(partial, "/tmp/NEUD_Demo_Record_2026-01-01_12-00-00.neud-partial.mp4");
  assert.doesNotMatch(partial, /\.mp4\.neud-partial$/);
});

test("OutputEngine includes disk adapter and recording session states", () => {
  const engine = read("desktop/src/output/output-engine-core.ts");
  assert.match(engine, /"disk"/);
  assert.match(engine, /recording/);
  assert.match(engine, /finalizing/);
  assert.match(engine, /startDiskRecording/);
  assert.match(engine, /getOutputTally/);
  assert.match(engine, /DISK_RECORDING_DEVICE_ID/);
});

test("DiskRecordingService uses OffscreenOutputRenderer frames", () => {
  const service = read("desktop/src/output/disk-recording-service.ts");
  assert.match(service, /OffscreenOutputRenderer/);
  assert.match(service, /appendFrame/);
  assert.match(service, /finalize/);
  assert.match(service, /buildPartialRecordingPath/);
  assert.match(service, /validateDestinationFolder/);
  const model = read("desktop/src/output/disk-recording-model.ts");
  assert.match(model, /buildPartialRecordingPath/);
  // Media Foundation requires a recognized .mp4 suffix on the partial file.
  assert.match(model, /\.neud-partial\$\{/);
});

test("native recorder addon builds and lists codecs on macOS", () => {
  const candidates = [
    path.join(desktopRoot, "dist/platform/macos/neud_recorder.node"),
    path.join(desktopRoot, "native/recorder/build/Release/neud_recorder.node"),
  ];
  const addonPath = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(addonPath, "neud_recorder.node must exist (run build-recorder-addon.mjs)");
  const addon = require(addonPath);
  assert.equal(typeof addon.open, "function");
  assert.equal(typeof addon.appendFrame, "function");
  assert.equal(typeof addon.finalize, "function");
  assert.equal(typeof addon.listCodecs, "function");
  const codecs = addon.listCodecs();
  assert.ok(Array.isArray(codecs));
  assert.ok(codecs.some((codec) => codec.format === "prores-4444-mov"));
  if (process.platform === "darwin") {
    const platform = addon.platform();
    assert.equal(platform.encoder, "avfoundation");
    assert.equal(platform.available, true);
    const prores = codecs.find((codec) => codec.format === "prores-4444-mov");
    assert.equal(prores.available, true);
  }
});

test("OutputManager exposes Record to Disk destination", () => {
  const manager = read("src/components/output/OutputManager.tsx");
  const tally = read("src/components/output/GlobalOutputTally.tsx");
  assert.match(manager, /outputType === "disk"/);
  assert.match(manager, /pickRecordingFolder/);
  assert.match(manager, /prores-4444-mov/);
  assert.match(manager, /Open Folder/);
  // Global LIVE/REC tally lives in GlobalOutputTally (title bar), not OutputManager.
  assert.match(tally, /label="REC"/);
  assert.match(tally, /data-global-output-tally/);
});

test("Windows ProRes encode remains unavailable without approved redistributable", () => {
  const win = read("desktop/native/recorder/recorder-win.cpp");
  assert.match(win, /LGPL/);
  assert.match(win, /available/);
  assert.match(win, /false/);
  assert.doesNotMatch(win, /enable-gpl/i);
});
