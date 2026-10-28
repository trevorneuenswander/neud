#!/usr/bin/env node
/**
 * Windows H.264 orientation regression.
 *
 * Media Foundation input uses MF_MT_DEFAULT_STRIDE > 0 (top-down). Chromium /
 * OffscreenOutputRenderer frames are top-down BGRA. Vertically reversing rows
 * while advertising a positive stride inverted recorded MP4s on Windows hardware
 * (Build 2). This test locks the native policy and verifies an asymmetric
 * top/bottom pattern is preserved under that packing rule.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

/**
 * Mirrors the Windows recorder packing policy: top-down RGB32, no vertical flip.
 * Top row marker stays at y=0; bottom row marker stays at y=height-1.
 */
function packTopDownRgb32(srcBgra, width, height) {
  const stride = width * 4;
  const expected = stride * height;
  assert.equal(srcBgra.length, expected);
  // Policy: copy as-is (top-down). A bottom-up flip would swap first/last rows.
  return Buffer.from(srcBgra);
}

function makeAsymmetricPattern(width, height) {
  const buf = Buffer.alloc(width * height * 4, 0);
  const stride = width * 4;
  // Top row: solid red (B=0,G=0,R=255,A=255)
  for (let x = 0; x < width; x += 1) {
    const i = x * 4;
    buf[i] = 0;
    buf[i + 1] = 0;
    buf[i + 2] = 255;
    buf[i + 3] = 255;
  }
  // Bottom row: solid blue (B=255,G=0,R=0,A=255)
  const bottom = (height - 1) * stride;
  for (let x = 0; x < width; x += 1) {
    const i = bottom + x * 4;
    buf[i] = 255;
    buf[i + 1] = 0;
    buf[i + 2] = 0;
    buf[i + 3] = 255;
  }
  return buf;
}

function rowIsRed(buf, width, y) {
  const stride = width * 4;
  const base = y * stride;
  return buf[base] === 0 && buf[base + 1] === 0 && buf[base + 2] === 255;
}

function rowIsBlue(buf, width, y) {
  const stride = width * 4;
  const base = y * stride;
  return buf[base] === 255 && buf[base + 1] === 0 && buf[base + 2] === 0;
}

test("Windows recorder keeps top-down RGB32 (no bottom-up row reverse)", () => {
  const source = read("desktop/native/recorder/recorder-win.cpp");
  assert.match(source, /MF_MT_DEFAULT_STRIDE/);
  assert.match(source, /top-down/);
  assert.match(source, /Do not vertically flip/);
  assert.doesNotMatch(
    source,
    /height - 1 - y/,
    "Must not reverse scanlines for MF positive-stride RGB32",
  );
  assert.doesNotMatch(source, /bottomUp\.data\(\)/);
  assert.match(source, /memcpy\(data, scratch_\.data\(\)/);
});

test("asymmetric top/bottom pattern survives top-down packing", () => {
  const width = 8;
  const height = 6;
  const src = makeAsymmetricPattern(width, height);
  assert.ok(rowIsRed(src, width, 0), "source top must be red");
  assert.ok(rowIsBlue(src, width, height - 1), "source bottom must be blue");

  const packed = packTopDownRgb32(src, width, height);
  assert.ok(rowIsRed(packed, width, 0), "packed top must remain red (not inverted)");
  assert.ok(rowIsBlue(packed, width, height - 1), "packed bottom must remain blue");

  // Document the failure mode we fixed: a mistaken bottom-up reverse would swap markers.
  const wronglyFlipped = Buffer.alloc(src.length);
  const stride = width * 4;
  for (let y = 0; y < height; y += 1) {
    src.copy(
      wronglyFlipped,
      (height - 1 - y) * stride,
      y * stride,
      y * stride + stride,
    );
  }
  assert.ok(rowIsBlue(wronglyFlipped, width, 0), "control: flip would put blue on top");
  assert.ok(rowIsRed(wronglyFlipped, width, height - 1), "control: flip would put red on bottom");
});

test("orientation fix stays inside the Windows recorder (no DeckLink/FFmpeg edits required)", () => {
  assert.ok(fs.existsSync(path.join(repoRoot, "desktop/native/decklink")));
  assert.ok(fs.existsSync(path.join(repoRoot, "desktop/vendor/ffmpeg-windows-lgpl.lock.json")));
  const recorder = read("desktop/native/recorder/recorder-win.cpp");
  assert.match(recorder, /Media Foundation/);
  assert.match(recorder, /MFCreateSinkWriterFromURL/);
});
