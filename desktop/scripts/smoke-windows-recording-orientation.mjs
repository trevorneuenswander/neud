#!/usr/bin/env node
/**
 * Windows CI smoke: encode a short H.264 MP4 via neud_recorder with an asymmetric
 * top/bottom pattern, then decode one frame with bundled LGPL ffmpeg and verify
 * top remains red and bottom remains blue (not vertically inverted).
 *
 * Skips on non-Windows. Requires NEUD_WITH_FFMPEG=1 for ffmpeg.exe decode tooling.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

if (process.platform !== "win32") {
  console.log("[rec-orientation-smoke] Skipping — not Windows.");
  process.exit(0);
}

const recorderAddon = path.join(desktopRoot, "dist", "platform", "windows", "neud_recorder.node");
const ffmpegDir =
  process.env.FFMPEG_DIR ||
  path.join(desktopRoot, "vendor", "ffmpeg-windows-lgpl", "current");
const ffmpegExe = path.join(ffmpegDir, "bin", "ffmpeg.exe");

assert.ok(fs.existsSync(recorderAddon), `Missing recorder addon: ${recorderAddon}`);
assert.ok(fs.existsSync(ffmpegExe), `Missing ffmpeg.exe for decode check: ${ffmpegExe}`);

const width = 64;
const height = 48;
const stride = width * 4;

function makeAsymmetricFrame() {
  const buf = Buffer.alloc(stride * height, 0);
  // Top row: red BGRA
  for (let x = 0; x < width; x += 1) {
    const i = x * 4;
    buf[i] = 0;
    buf[i + 1] = 0;
    buf[i + 2] = 255;
    buf[i + 3] = 255;
  }
  // Bottom row: blue BGRA
  const bottom = (height - 1) * stride;
  for (let x = 0; x < width; x += 1) {
    const i = bottom + x * 4;
    buf[i] = 255;
    buf[i + 1] = 0;
    buf[i + 2] = 0;
    buf[i + 3] = 255;
  }
  // Fill mid rows mid-gray so encoder has content
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * stride + x * 4;
      buf[i] = 40;
      buf[i + 1] = 40;
      buf[i + 2] = 40;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-rec-orient-"));
const mp4Path = path.join(tmpDir, "orient-smoke.neud-partial.mp4");
const rawPath = path.join(tmpDir, "frame.bgra");

const addon = require(recorderAddon);
assert.equal(typeof addon.open, "function");
const platform = addon.platform();
assert.equal(platform.available, true);

const opened = addon.open({
  filePath: mp4Path,
  width,
  height,
  format: "h264-mp4",
  fpsNumerator: 30,
  fpsDenominator: 1,
  preserveAlpha: false,
  backgroundR: 0,
  backgroundG: 0,
  backgroundB: 0,
});
assert.equal(opened.ok, true, opened.error || "recorder open failed");

const frame = makeAsymmetricFrame();
for (let i = 0; i < 15; i += 1) {
  const ptsUs = Math.round((i * 1_000_000) / 30);
  const result = addon.appendFrame(opened.sessionId, {
    width,
    height,
    ptsUs,
    bgra: frame,
  });
  assert.equal(result.ok, true, result.error || `appendFrame ${i} failed`);
}

const finalized = addon.finalize(opened.sessionId);
assert.equal(finalized.ok, true, finalized.error || "finalize failed");
assert.ok(fs.existsSync(mp4Path), "partial mp4 missing after finalize");
assert.ok(fs.statSync(mp4Path).size > 0, "mp4 is empty");

// Extract one RGB24 frame (ffmpeg maps BGRA input from our encoder as upright RGB)
const extract = spawnSync(
  ffmpegExe,
  [
    "-y",
    "-i",
    mp4Path,
    "-vf",
    `scale=${width}:${height}`,
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    rawPath,
  ],
  { encoding: "utf8" },
);
if (extract.status !== 0 || !fs.existsSync(rawPath)) {
  console.error(extract.stderr || extract.stdout || "ffmpeg extract failed");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
}

const rgb = fs.readFileSync(rawPath);
assert.equal(rgb.length, width * height * 3);

function sampleRgb24(y, x) {
  const i = (y * width + x) * 3;
  return { r: rgb[i], g: rgb[i + 1], b: rgb[i + 2] };
}

const top = sampleRgb24(0, Math.floor(width / 2));
const bottom = sampleRgb24(height - 1, Math.floor(width / 2));

// Allow compression drift; require dominant channel matches intended marker.
assert.ok(
  top.r > top.b + 40 && top.r > top.g + 40,
  `Top row should be red-dominant after encode/decode, got r=${top.r} g=${top.g} b=${top.b}`,
);
assert.ok(
  bottom.b > bottom.r + 40 && bottom.b > bottom.g + 40,
  `Bottom row should be blue-dominant after encode/decode, got r=${bottom.r} g=${bottom.g} b=${bottom.b}`,
);

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(
  JSON.stringify(
    {
      ok: true,
      encoder: platform.encoder,
      width,
      height,
      top,
      bottom,
      note: "Asymmetric pattern survived MF H.264 encode/decode without vertical inversion.",
    },
    null,
    2,
  ),
);
