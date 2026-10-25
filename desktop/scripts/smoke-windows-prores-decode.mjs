#!/usr/bin/env node
/**
 * Windows CI smoke: generate a short ProRes MOV with the pinned LGPL ffmpeg.exe,
 * then open/decode one frame via neud_video.node.
 *
 * Skips (exit 0) on non-Windows. Fails hard on Windows when NEUD_WITH_FFMPEG=1
 * and the decoder/addons/ffmpeg tooling are missing.
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
  console.log("[prores-smoke] Skipping — not Windows.");
  process.exit(0);
}

if (process.env.NEUD_WITH_FFMPEG !== "1") {
  console.log("[prores-smoke] Skipping — NEUD_WITH_FFMPEG!=1.");
  process.exit(0);
}

const ffmpegDir =
  process.env.FFMPEG_DIR ||
  path.join(desktopRoot, "vendor", "ffmpeg-windows-lgpl", "current");
const ffmpegExe = path.join(ffmpegDir, "bin", "ffmpeg.exe");
const videoAddon = path.join(desktopRoot, "dist", "platform", "windows", "neud_video.node");
const ffmpegDllDir = path.join(desktopRoot, "dist", "platform", "windows", "ffmpeg");

assert.ok(fs.existsSync(ffmpegExe), `Missing ffmpeg.exe at ${ffmpegExe}`);
assert.ok(fs.existsSync(videoAddon), `Missing video addon at ${videoAddon}`);
assert.ok(fs.existsSync(ffmpegDllDir), `Missing staged FFmpeg DLLs at ${ffmpegDllDir}`);

const dlls = fs
  .readdirSync(ffmpegDllDir)
  .filter((name) => name.toLowerCase().endsWith(".dll"));
for (const lib of ["avcodec", "avformat", "avutil", "swscale"]) {
  assert.ok(
    dlls.some((name) => name.toLowerCase().startsWith(lib)),
    `Missing staged ${lib} DLL under ${ffmpegDllDir}`,
  );
}

const licenseOk =
  fs.existsSync(path.join(ffmpegDllDir, "LICENSE.FFmpeg.txt")) ||
  fs.existsSync(path.join(ffmpegDllDir, "SOURCE_OFFER.txt"));
assert.ok(licenseOk, "Missing FFmpeg LICENSE/SOURCE_OFFER beside staged DLLs");

// Ensure Windows can resolve FFmpeg DLLs when loading the addon.
const addonDir = path.dirname(videoAddon);
process.env.PATH = `${ffmpegDllDir};${addonDir};${process.env.PATH || ""}`;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-prores-smoke-"));
const samplePath = path.join(tmpDir, "smoke-prores4444.mov");

const gen = spawnSync(
  ffmpegExe,
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=128x72:d=0.5:r=30",
    "-c:v",
    "prores_ks",
    "-profile:v",
    "4444",
    "-pix_fmt",
    "yuva444p10le",
    samplePath,
  ],
  { encoding: "utf8" },
);
if (gen.status !== 0 || !fs.existsSync(samplePath)) {
  console.error(gen.stderr || gen.stdout || "ffmpeg failed");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.error(
    "[prores-smoke] Unable to generate ProRes sample with bundled ffmpeg.exe. " +
      "Not claiming decode success.",
  );
  process.exit(1);
}

const addon = require(videoAddon);
assert.equal(typeof addon.open, "function");
const platform = addon.platform();
assert.equal(platform.decoder, "ffmpeg-lgpl");
assert.equal(platform.available, true);

const opened = addon.open(samplePath);
assert.equal(opened.ok, true, opened.error || "open failed");
assert.ok(opened.info?.width > 0);
assert.ok(opened.info?.height > 0);

addon.play(opened.sessionId);
let frame = null;
const deadline = Date.now() + 5000;
while (Date.now() < deadline) {
  frame = addon.pullFrame(opened.sessionId);
  if (frame?.bgra?.length) break;
  const spinUntil = Date.now() + 50;
  while (Date.now() < spinUntil) {
    /* brief wait for decoder worker */
  }
}
addon.pause(opened.sessionId);
addon.stop(opened.sessionId);
addon.close(opened.sessionId);

fs.rmSync(tmpDir, { recursive: true, force: true });

assert.ok(frame, "Decoder did not produce a frame within 5s");
assert.ok(frame.bgra.length >= frame.width * frame.height * 4);

console.log(
  JSON.stringify(
    {
      ok: true,
      decoder: platform.decoder,
      sample: path.basename(samplePath),
      info: opened.info,
      frame: {
        width: frame.width,
        height: frame.height,
        byteLength: frame.bgra.length,
        ptsUs: frame.ptsUs,
      },
      ffmpegDllCount: dlls.length,
    },
    null,
    2,
  ),
);
