#!/usr/bin/env node
/**
 * Windows CI smoke: ProRes playback control transitions via neud_video.node.
 *
 * Verifies:
 * - Natural EOF → Ended
 * - Play after Ended resumes from the beginning (produces new frames)
 * - Stop resets presented frame toward pts 0
 * - Stop → Play starts again
 * - Restart works from ended
 * - Loop seeks at EOF without sticking in Ended
 *
 * Skips (exit 0) on non-Windows or when NEUD_WITH_FFMPEG!=1.
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
  console.log("[prores-playback-controls] Skipping — not Windows.");
  process.exit(0);
}

if (process.env.NEUD_WITH_FFMPEG !== "1") {
  console.log("[prores-playback-controls] Skipping — NEUD_WITH_FFMPEG!=1.");
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

process.env.PATH = `${ffmpegDllDir};${path.dirname(videoAddon)};${process.env.PATH || ""}`;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-prores-controls-"));
const samplePath = path.join(tmpDir, "controls-prores4444.mov");

function generateSample(durationSeconds) {
  const gen = spawnSync(
    ffmpegExe,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=red:s=96x54:d=${durationSeconds}:r=30`,
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
    process.exit(1);
  }
}

function sleepMs(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* spin */
  }
}

function waitForState(addon, sessionId, wanted, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = addon.getStatus(sessionId);
    if (status?.state === wanted) return status;
    sleepMs(40);
  }
  return addon.getStatus(sessionId);
}

function waitForFrame(addon, sessionId, timeoutMs, minPtsUs = -1) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const frame = addon.pullFrame(sessionId);
    if (frame?.bgra?.length) {
      last = frame;
      if (minPtsUs < 0 || frame.ptsUs >= minPtsUs) return frame;
    }
    sleepMs(40);
  }
  return last;
}

generateSample(0.4);

const addon = require(videoAddon);
const platform = addon.platform();
assert.equal(platform.decoder, "ffmpeg-lgpl");
assert.equal(platform.available, true);

const opened = addon.open(samplePath);
assert.equal(opened.ok, true, opened.error || "open failed");
const sessionId = opened.sessionId;

// --- Play through to Ended ---
addon.setLoop(sessionId, false);
addon.play(sessionId);
const firstPlayFrame = waitForFrame(addon, sessionId, 3000);
assert.ok(firstPlayFrame?.bgra?.length, "initial play produced no frame");

const ended = waitForState(addon, sessionId, "ended", 8000);
assert.equal(ended?.state, "ended", `expected ended after natural EOF, got ${ended?.state}`);

// --- Play after EOF must restart from the beginning (repeat cycles) ---
for (let cycle = 1; cycle <= 3; cycle += 1) {
  addon.play(sessionId);
  const afterEofPlaying = waitForState(addon, sessionId, "playing", 2000);
  assert.equal(
    afterEofPlaying?.state,
    "playing",
    `play after ended (cycle ${cycle}) did not enter playing (got ${afterEofPlaying?.state})`,
  );
  const replayFrame = waitForFrame(addon, sessionId, 4000);
  assert.ok(replayFrame?.bgra?.length, `play after ended (cycle ${cycle}) produced no frame`);
  if (cycle < 3) {
    assert.equal(
      waitForState(addon, sessionId, "ended", 8000)?.state,
      "ended",
      `expected ended after cycle ${cycle}`,
    );
  }
}

// Allow playback to advance, then Stop must reset toward pts 0.
sleepMs(120);
addon.stop(sessionId);
const stopped = waitForState(addon, sessionId, "stopped", 3000);
assert.equal(stopped?.state, "stopped", `stop did not enter stopped (got ${stopped?.state})`);
const stopFrame = addon.pullFrame(sessionId);
assert.ok(stopFrame?.bgra?.length, "stop did not present a frame");
assert.ok(
  typeof stopFrame.ptsUs === "number" && stopFrame.ptsUs <= 50_000,
  `stop did not reset near pts 0 (ptsUs=${stopFrame.ptsUs})`,
);

// --- Stop → Play ---
addon.play(sessionId);
assert.equal(waitForState(addon, sessionId, "playing", 2000)?.state, "playing");
assert.ok(waitForFrame(addon, sessionId, 3000)?.bgra?.length, "play after stop produced no frame");

// --- Pause → Play resume ---
addon.pause(sessionId);
assert.equal(waitForState(addon, sessionId, "paused", 2000)?.state, "paused");
addon.play(sessionId);
assert.equal(waitForState(addon, sessionId, "playing", 2000)?.state, "playing");

// --- Playing → Play is a no-op (still playing) ---
addon.play(sessionId);
assert.equal(addon.getStatus(sessionId)?.state, "playing");

// --- Restart from playing ---
addon.restart(sessionId);
assert.equal(waitForState(addon, sessionId, "playing", 2000)?.state, "playing");
assert.ok(waitForFrame(addon, sessionId, 3000)?.bgra?.length, "restart produced no frame");

// --- Natural end then Restart ---
assert.equal(waitForState(addon, sessionId, "ended", 8000)?.state, "ended");
addon.restart(sessionId);
assert.equal(waitForState(addon, sessionId, "playing", 2000)?.state, "playing");

// --- Loop at EOF stays out of Ended ---
addon.stop(sessionId);
addon.setLoop(sessionId, true);
addon.play(sessionId);
sleepMs(1200);
const loopStatus = addon.getStatus(sessionId);
assert.notEqual(
  loopStatus?.state,
  "ended",
  "looping playback entered ended instead of seeking",
);
assert.ok(
  loopStatus?.state === "playing" || loopStatus?.state === "paused",
  `unexpected loop state ${loopStatus?.state}`,
);

addon.stop(sessionId);
addon.close(sessionId);

// --- Close while playing must join cleanly (no hang) ---
{
  const midPlay = addon.open(samplePath);
  assert.equal(midPlay.ok, true, midPlay.error || "open failed for close-while-playing");
  addon.play(midPlay.sessionId);
  assert.ok(waitForFrame(addon, midPlay.sessionId, 3000)?.bgra?.length);
  const closeStarted = Date.now();
  addon.close(midPlay.sessionId);
  const closeMs = Date.now() - closeStarted;
  assert.ok(closeMs < 5000, `close while playing took too long (${closeMs}ms) — possible deadlock`);
}

// --- Close after EOF must join the sleeping worker cleanly ---
{
  const afterEof = addon.open(samplePath);
  assert.equal(afterEof.ok, true, afterEof.error || "open failed for close-after-eof");
  addon.setLoop(afterEof.sessionId, false);
  addon.play(afterEof.sessionId);
  assert.equal(waitForState(addon, afterEof.sessionId, "ended", 8000)?.state, "ended");
  const closeStarted = Date.now();
  addon.close(afterEof.sessionId);
  const closeMs = Date.now() - closeStarted;
  assert.ok(closeMs < 5000, `close after EOF took too long (${closeMs}ms) — possible deadlock`);
}

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(
  JSON.stringify(
    {
      ok: true,
      decoder: platform.decoder,
      note:
        "EOF→Play×3, stop reset, stop→play, pause→play, restart, loop, close-while-playing, and close-after-EOF verified.",
    },
    null,
    2,
  ),
);
