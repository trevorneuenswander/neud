#!/usr/bin/env node
/**
 * Windows v0.3.1 release gates for native modules.
 * - DeckLink must be a real (non-stub) addon when NEUD_REQUIRE_REAL_DECKLINK=1
 * - Recorder addon must exist for H.264 Record to Disk
 * - ProRes decode (FFmpeg) is optional: report capability, never claim when DLLs missing
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isRealDeckLinkAddonBinary } from "./build-decklink-addon.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireRealDeckLink =
  process.env.NEUD_REQUIRE_REAL_DECKLINK === "1" ||
  process.env.NEUD_REQUIRE_REAL_DECKLINK === "true";

const decklinkAddon = path.join(desktopRoot, "dist", "platform", "decklink", "neud_decklink.node");
const decklinkMeta = path.join(desktopRoot, "dist", "platform", "decklink", "neud_decklink.meta.json");
const videoAddon = path.join(desktopRoot, "dist", "platform", "windows", "neud_video.node");
const recorderAddon = path.join(desktopRoot, "dist", "platform", "windows", "neud_recorder.node");
const ffmpegDir = path.join(desktopRoot, "dist", "platform", "windows", "ffmpeg");

const report = {
  platform: process.platform,
  decklink: { present: false, stub: null, real: false },
  video: { present: false },
  recorder: { present: false },
  ffmpegLgpl: { present: false, dllCount: 0 },
  windowsProResPlaybackClaimed: false,
};

assert.ok(fs.existsSync(decklinkAddon), `Missing DeckLink addon: ${decklinkAddon}`);
assert.ok(fs.existsSync(decklinkMeta), `Missing DeckLink meta: ${decklinkMeta}`);
const meta = JSON.parse(fs.readFileSync(decklinkMeta, "utf8"));
report.decklink.present = true;
report.decklink.stub = meta.stub === true;
report.decklink.real = isRealDeckLinkAddonBinary(decklinkAddon);

if (requireRealDeckLink) {
  assert.equal(meta.stub, false, "NEUD_REQUIRE_REAL_DECKLINK=1 but DeckLink meta.stub is true.");
  assert.ok(report.decklink.real, "NEUD_REQUIRE_REAL_DECKLINK=1 but DeckLink binary failed real check.");
}

if (process.platform === "win32") {
  assert.ok(fs.existsSync(videoAddon), `Missing Windows video addon: ${videoAddon}`);
  assert.ok(fs.existsSync(recorderAddon), `Missing Windows recorder addon: ${recorderAddon}`);
  report.video.present = true;
  report.recorder.present = true;
}

if (fs.existsSync(ffmpegDir)) {
  const dlls = fs
    .readdirSync(ffmpegDir)
    .filter((name) => name.toLowerCase().endsWith(".dll"));
  report.ffmpegLgpl.present = dlls.length > 0;
  report.ffmpegLgpl.dllCount = dlls.length;
}

const withFfmpeg = process.env.NEUD_WITH_FFMPEG === "1";
report.windowsProResPlaybackClaimed = withFfmpeg && report.ffmpegLgpl.present;
if (withFfmpeg && !report.ffmpegLgpl.present) {
  assert.fail(
    "NEUD_WITH_FFMPEG=1 but no staged LGPL FFmpeg DLLs under dist/platform/windows/ffmpeg. " +
      "Run fetch-windows-ffmpeg-lgpl.mjs + package-windows-ffmpeg-lgpl.mjs or unset NEUD_WITH_FFMPEG.",
  );
}
if (withFfmpeg) {
  const required = ["avcodec", "avformat", "avutil", "swscale"];
  const dllNames = fs
    .readdirSync(ffmpegDir)
    .filter((name) => name.toLowerCase().endsWith(".dll"))
    .map((name) => name.toLowerCase());
  for (const lib of required) {
    assert.ok(
      dllNames.some((name) => name.startsWith(lib)),
      `Missing required FFmpeg DLL prefix ${lib} under ${ffmpegDir}`,
    );
  }
  assert.ok(
    fs.existsSync(path.join(ffmpegDir, "LICENSE.FFmpeg.txt")) ||
      fs.existsSync(path.join(ffmpegDir, "SOURCE_OFFER.txt")),
    "LGPL license/source-offer text missing beside staged FFmpeg DLLs",
  );
}

console.log(JSON.stringify({ ok: true, ...report }, null, 2));
if (!report.windowsProResPlaybackClaimed) {
  console.log(
    "[gate] Windows ProRes playback is NOT claimed for this build (FFmpeg LGPL DLLs absent or NEUD_WITH_FFMPEG unset).",
  );
} else {
  console.log(
    "[gate] Windows ProRes playback packaging gate passed (LGPL FFmpeg DLLs staged). Hardware decode still requires owner validation.",
  );
}
