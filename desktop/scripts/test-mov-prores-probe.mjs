/**
 * Unit checks for ProRes 4444 .mov probe + video display foundation wiring.
 * Does not require real ProRes media; synthesizes minimal atom layouts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

function writeAtom(type, payload) {
  const size = 8 + payload.length;
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(size, 0);
  buf.write(type, 4, 4, "ascii");
  payload.copy(buf, 8);
  return buf;
}

function buildMinimalMov(codecFourCc) {
  // stsd with one visual sample entry carrying fourcc + width/height
  const sampleEntry = Buffer.alloc(86);
  sampleEntry.writeUInt32BE(86, 0); // sample entry size
  sampleEntry.write(codecFourCc, 4, 4, "ascii");
  // VisualSampleEntry width/height at +32/+34 from entry start in our probe reader:
  // probe reads stsd content and uses offsets 32/34 relative to stsd payload start
  // stsd payload: version/flags(4) + entry_count(4) + entry...
  const stsdPayload = Buffer.alloc(8 + 86);
  stsdPayload.writeUInt32BE(0, 0); // version/flags
  stsdPayload.writeUInt32BE(1, 4); // entry count
  sampleEntry.copy(stsdPayload, 8);
  // width/height at bytes 32/34 of stsd payload (= entry+24 from entry start in ISO;
  // our probe uses fixed 32/34 on the stsd buffer which includes the 8-byte header)
  stsdPayload.writeUInt16BE(1920, 32);
  stsdPayload.writeUInt16BE(1080, 34);

  const stsd = writeAtom("stsd", stsdPayload);
  const stbl = writeAtom("stbl", stsd);
  const minf = writeAtom("minf", stbl);
  const mdia = writeAtom("mdia", minf);
  const trak = writeAtom("trak", mdia);
  const moov = writeAtom("moov", trak);
  const ftyp = writeAtom("ftyp", Buffer.from("qt  ", "ascii"));
  return Buffer.concat([ftyp, moov]);
}

test("assertMovFileExtension rejects non-mov names", async () => {
  const distProbe = path.join(desktopRoot, "dist/media/mov-prores-probe.js");
  assert.ok(fs.existsSync(distProbe), "desktop build must produce mov-prores-probe.js");
  const { assertMovFileExtension } = require(distProbe);
  assert.equal(assertMovFileExtension("clip.mp4"), "Choose a .mov file containing Apple ProRes 4444 with alpha.");
  assert.equal(assertMovFileExtension("clip.MOV"), null);
});

test("probe rejects unsupported ProRes profiles", async () => {
  const { probeMovProRes4444 } = require(path.join(desktopRoot, "dist/media/mov-prores-probe.js"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "neud-prores-"));
  const filePath = path.join(tmp, "proxy.mov");
  fs.writeFileSync(filePath, buildMinimalMov("apcn")); // ProRes 422 Proxy — unsupported
  const result = await probeMovProRes4444(filePath);
  assert.equal(result.ok, false);
  assert.match(result.error, /Unsupported ProRes profile|apcn/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("probe accepts ap4h ProRes 4444 synthetic atoms", async () => {
  const { probeMovProRes4444 } = require(path.join(desktopRoot, "dist/media/mov-prores-probe.js"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "neud-prores-"));
  const filePath = path.join(tmp, "alpha.mov");
  fs.writeFileSync(filePath, buildMinimalMov("ap4h"));
  const result = await probeMovProRes4444(filePath);
  assert.equal(result.ok, true);
  assert.equal(result.codecFourCc, "ap4h");
  assert.equal(result.hasAlphaHint, true);
  assert.equal(result.container, "mov");
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("video display foundation wires chooser, IPC, migration, and output rejection", () => {
  const addDisplay = fs.readFileSync(
    path.join(desktopRoot, "../src/components/developer-tools/AddDisplayButton.tsx"),
    "utf8",
  );
  assert.match(addDisplay, /ProRes 4444 w\/ Alpha Video File/);
  assert.match(addDisplay, /Coming Soon/);
  assert.match(addDisplay, /Create with AI/);
  assert.match(addDisplay, /UploadVideoDisplayForm/);

  const migration = fs.readFileSync(
    path.join(desktopRoot, "src/database/migrations/045_display_video_media.sql"),
    "utf8",
  );
  assert.match(migration, /display_media_assets/);

  const migrateList = fs.readFileSync(
    path.join(desktopRoot, "src/database/migrate.ts"),
    "utf8",
  );
  assert.match(migrateList, /045_display_video_media\.sql/);

  const outputCore = fs.readFileSync(
    path.join(desktopRoot, "src/output/output-engine-core.ts"),
    "utf8",
  );
  assert.doesNotMatch(outputCore, /video-decoder-unavailable/);
  assert.match(outputCore, /project-video/);

  const preload = fs.readFileSync(path.join(desktopRoot, "src/preload.ts"), "utf8");
  assert.match(preload, /neud:media:pickProResMov/);
  assert.match(preload, /neud:media:createProResDisplay/);
  assert.match(preload, /neud:video:play/);

  assert.ok(
    fs.existsSync(path.join(desktopRoot, "dist/platform/macos/neud_video.node")) ||
      fs.existsSync(path.join(desktopRoot, "dist/platform/windows/neud_video.node")) ||
      fs.existsSync(path.join(desktopRoot, "native/video/build/Release/neud_video.node")),
    "native video addon must be built",
  );
  assert.ok(fs.existsSync(path.join(desktopRoot, "../docs/licensing/ffmpeg-lgpl.md")));
});
