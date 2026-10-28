#!/usr/bin/env node
/**
 * v0.3.1 — Video playback control contract regressions.
 *
 * Covers shared JS service expectations and Windows FFmpeg decoder source
 * contracts for Play-after-EOF and Stop-reset-to-zero (Build 3 hardware bugs).
 * Does not alter macOS AVFoundation behavior assertions beyond shared service.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

/** Documented shared control transitions (UI → VideoPlaybackService → native). */
const PLAYBACK_TRANSITIONS = [
  { from: "playing", command: "pause", expect: "paused at current position" },
  { from: "paused", command: "play", expect: "resume" },
  { from: "playing", command: "stop", expect: "stopped at 0" },
  { from: "paused", command: "stop", expect: "stopped at 0" },
  { from: "ended", command: "play", expect: "playing from 0" },
  { from: "ended", command: "stop", expect: "stopped at 0" },
  { from: "stopped", command: "play", expect: "playing from 0" },
  { from: "any", command: "restart", expect: "playing from 0" },
  { from: "playing", command: "play", expect: "no interruption" },
];

test("shared playback transition table is documented for regression coverage", () => {
  assert.equal(PLAYBACK_TRANSITIONS.length, 9);
  assert.ok(PLAYBACK_TRANSITIONS.some((row) => row.from === "ended" && row.command === "play"));
  assert.ok(PLAYBACK_TRANSITIONS.some((row) => row.command === "stop" && /stopped at 0/.test(row.expect)));
});

test("shared VideoPlaybackService wires play/pause/stop/restart without platform forks", () => {
  const service = read("desktop/src/media/video/video-playback-service.ts");
  assert.match(service, /async play\(/);
  assert.match(service, /async pause\(/);
  assert.match(service, /async stop\(/);
  assert.match(service, /async restart\(/);
  assert.doesNotMatch(service, /process\.platform/);
  assert.doesNotMatch(service, /win32/);
  assert.doesNotMatch(service, /darwin/);
  // Stop refreshes the presented frame after native seek-to-zero.
  assert.match(service, /pullFrame\(nativeId\)/);
  assert.match(service, /Native stop seeks to zero/);
});

test("UI playback controls dispatch shared API actions without Windows branches", () => {
  const ui = read("src/components/displays/VideoPlaybackControls.tsx");
  assert.match(ui, /action: "play" \| "pause" \| "stop" \| "restart"/);
  assert.doesNotMatch(ui, /win32|darwin|process\.platform/);
});

test("Windows FFmpeg decoder: Play after EOF seeks and keeps/restarts worker", () => {
  const win = read("desktop/native/video/video-decoder-win-ffmpeg.cpp");
  // Must not break out of decodeLoop on natural EOF (finished joinable thread made Play no-op).
  assert.match(win, /Natural EOF: enter Ended and keep the worker alive/);
  assert.match(win, /state_ = PlaybackState::Ended/);
  assert.doesNotMatch(
    win,
    /state_ = PlaybackState::Ended;\s*emitState[^\n]*;\s*break;/,
  );
  // Play from ended/stopped/opened seeks to start.
  assert.match(
    win,
    /state_ == PlaybackState::Ended \|\| state_ == PlaybackState::Stopped \|\|\s*state_ == PlaybackState::Opened/,
  );
  assert.match(win, /seekStartUnlocked\(\)/);
  // Playing + Play is a no-op.
  assert.match(win, /Already playing: do not interrupt or re-seek/);
  assert.match(win, /if \(state_ == PlaybackState::Playing\) return;/);
  // Pause resume keeps worker.
  assert.match(win, /Resume paused decode loop without restarting the worker/);
});

test("Windows FFmpeg decoder: Stop seeks to zero, flushes, and presents first frame", () => {
  const win = read("desktop/native/video/video-decoder-win-ffmpeg.cpp");
  assert.match(win, /decodeOneFrameUnlocked/);
  assert.match(win, /avcodec_flush_buffers/);
  const stopFn = win.slice(win.indexOf("void stop() override"), win.indexOf("void restart() override"));
  assert.match(stopFn, /seekStartUnlocked\(\)/);
  assert.match(stopFn, /decodeOneFrameUnlocked\(&firstFrame\)/);
  assert.match(stopFn, /frameCb\(firstFrame\)/);
  assert.match(stopFn, /PlaybackState::Stopped/);
});

test("Windows FFmpeg decoder: Restart remains stop then play", () => {
  const win = read("desktop/native/video/video-decoder-win-ffmpeg.cpp");
  const restart = win.slice(win.indexOf("void restart() override"), win.indexOf("void setLoop"));
  assert.match(restart, /stop\(\);/);
  assert.match(restart, /play\(\);/);
});

test("Windows FFmpeg decoder: loop at EOF seeks without entering Ended", () => {
  const win = read("desktop/native/video/video-decoder-win-ffmpeg.cpp");
  assert.match(win, /if \(loop_\) \{\s*std::lock_guard<std::mutex> lock\(mutex_\);\s*seekStartUnlocked\(\);/s);
});

test("macOS decoder contract for stop/play remains intact", () => {
  const mac = read("desktop/native/video/video-decoder-mac.mm");
  assert.match(mac, /Resume paused decode loop without restarting the worker/);
  assert.match(mac, /if \(state_ == PlaybackState::Playing\) return;/);
  assert.match(mac, /decodeFirstFrameIntoLocked/);
  assert.match(mac, /state_ = PlaybackState::Ended/);
  assert.match(mac, /void restart\(\) override/);
  // macOS still resets reader on play from ended/stopped/opened.
  assert.match(
    mac,
    /state_ == PlaybackState::Ended \|\| state_ == PlaybackState::Stopped \|\|\s*state_ == PlaybackState::Opened/,
  );
});

test("playback control smoke script covers play-after-EOF and stop-reset", () => {
  const smoke = read("desktop/scripts/smoke-windows-prores-playback-controls.mjs");
  assert.match(smoke, /ended/);
  assert.match(smoke, /play after/);
  assert.match(smoke, /stop/);
  assert.match(smoke, /ptsUs/);
  assert.match(smoke, /cycle <= 3/);
  assert.match(smoke, /close while playing/);
  assert.match(smoke, /close after EOF/);
});
