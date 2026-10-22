#!/usr/bin/env node
/**
 * Broad Arrow Phase 3 / B3 — Stream Ticker long-run stutter regression.
 *
 * Root cause: the shared marquee (desktop/src/displays/legacy-ticker-marquee.js) started its
 * requestAnimationFrame chain with an untracked first frame and let every overlapping
 * async measurement callback start its own loop. The runtime delivers each snapshot three
 * times (neud:data event, postMessage, subscriber) and Stream Ticker re-requested a
 * marquee for every unsettled slot, so overlapping startMarqueeStable calls (and a cancel
 * that landed before the first frame) left orphaned loops that kept writing the same
 * transform forever. Orphans accumulate with every live update / reconnect => jitter that
 * only becomes visible after hours.
 *
 * Environment:
 *   NEUD_TICKER_SOAK_HOURS   simulated hours for the accelerated soak (default 4)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadValidationPuppeteer } from "./lib/resolve-validation-browser.mjs";
import {
  measureRealTickCadence,
  runMarqueeOverlapChecks,
  runTickerSoak,
} from "./lib/stream-ticker-soak.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const SOAK_HOURS = Number(process.env.NEUD_TICKER_SOAK_HOURS ?? 4);

test("marquee keeps one authoritative, always-tracked scroll loop per container", () => {
  const marquee = read("desktop/src/displays/legacy-ticker-marquee.js");
  const ticker = read("desktop/src/displays/bundled/stream-ticker-v1.html");

  // Per-container loop record with an epoch; no WeakMap of bare frame ids.
  assert.match(marquee, /var loops = new WeakMap\(\)/);
  assert.doesNotMatch(marquee, /var rafs = new WeakMap/);
  assert.match(marquee, /loop\.epoch !== loopEpoch/);
  assert.match(marquee, /loop\.epoch !== requestEpoch/);

  // Every requestAnimationFrame the marquee schedules for a loop is stored in loop.rafId.
  const scheduleCalls = marquee.match(/requestAnimationFrame\(tick\)/g) ?? [];
  const trackedCalls = marquee.match(/loop\.rafId = requestAnimationFrame\(tick\)/g) ?? [];
  assert.equal(scheduleCalls.length, 2);
  assert.equal(trackedCalls.length, scheduleCalls.length);

  // Repeated identical snapshots must not restart or re-measure a settled slot.
  assert.match(marquee, /hasSettledStaticLayout/);
  assert.match(ticker, /legacyTickerMarquee\.hasSettledStaticLayout\(slot\.title\)/);

  // Approved speed / timing and shared-module constraints are untouched.
  assert.match(marquee, /speedPxPerSecond != null \? config\.speedPxPerSecond : 40/);
  assert.match(marquee, /PAUSE_MS = config\.pauseMs != null \? config\.pauseMs : 4000/);
  assert.match(marquee, /EASE_SEC = config\.easeSec != null \? config\.easeSec : 1/);
  assert.match(ticker, /createLegacyTickerMarquee\(\{ speedPxPerSecond: 40 \}\)/);
  assert.match(ticker, /FADE_MS = 250/);
  assert.doesNotMatch(marquee, /getBoundingClientRect/);
});

test(
  "overlapping starts and cancels never leave an orphaned scroll loop",
  { timeout: 120000 },
  async () => {
    const runtime = await loadValidationPuppeteer();
    const browser = await runtime.puppeteer.launch(runtime.launchOptions);
    let result;
    try {
      result = await runMarqueeOverlapChecks(browser);
    } finally {
      await browser.close();
    }

    assert.equal(result.overlappingStableStarts, 1, "three overlapping starts => one loop");
    assert.equal(result.syncDoubleStart, 1, "two starts before first frame => one loop");
    assert.equal(
      result.cancelledBeforeTick.liveLoopsAfterCancel,
      0,
      "cancel before first tick leaves no loop",
    );
    assert.equal(result.cancelledBeforeTick.hasActiveLoop, false);
    assert.equal(result.cancelledWhileMeasuring.liveLoops, 0, "late measurement must not revive");
    assert.equal(result.cancelledWhileMeasuring.hasActiveLoop, false);
    assert.equal(result.manyRestarts, 1, "repeated restarts never accumulate loops");
  },
);

test(
  "accelerated multi-hour soak keeps one loop per scrolling field and bounded work",
  { timeout: 15 * 60 * 1000 },
  async () => {
    const runtime = await loadValidationPuppeteer();
    const browser = await runtime.puppeteer.launch(runtime.launchOptions);
    let result;
    try {
      result = await runTickerSoak(browser, { hours: SOAK_HOURS });
    } finally {
      await browser.close();
    }

    const label = JSON.stringify({
      hours: result.hours,
      maxPendingTicks: result.stats.maxPendingTicks,
      pendingTicksAtEnd: result.pendingTicksAtEnd,
      scrollingSlots: result.scrollingSlots,
      quietMismatches: result.quietMismatches,
    });

    // Never more live scroll loops than there are slots (3); the defect reached 12.
    assert.ok(result.stats.maxPendingTicks <= 3, `loop count exceeded slots: ${label}`);
    assert.ok(result.scrollingSlots >= 1, `fixture should scroll: ${label}`);
    assert.equal(result.pendingTicksAtEnd, result.scrollingSlots, label);
    for (const sample of result.steadyPendingTicks) {
      assert.equal(sample, result.scrollingSlots, `steady state loop count: ${label}`);
    }
    assert.ok(result.quietChecks >= SOAK_HOURS * 60 - 1, "quiet-point checks ran");
    assert.equal(result.quietMismatchCount, 0, `loop/slot mismatch at quiet points: ${label}`);

    // rAF / timers do not accumulate.
    assert.ok(result.stats.maxPendingRaf <= 6, `pending rAF callbacks: ${label}`);
    assert.ok(result.stats.maxPendingTimers <= 8, `pending timers: ${label}`);
    assert.ok(result.pendingTimersAtEnd <= 8, `timers at end: ${label}`);

    // Transform stays bounded by one loop distance (clock is rebased every cycle), so
    // numeric precision cannot degrade over hours.
    assert.ok(result.stats.maxAbsTranslatePx > 100, "tracks actually scrolled");
    assert.ok(result.stats.maxAbsTranslatePx < 4000, `transform grew: ${label}`);

    // Structural DOM churn (childList / characterData / non-style attributes) stays low.
    // Before the fix an hour of identical snapshots produced ~100k mutations.
    for (const [hour, count] of Object.entries(result.stats.mutationsByHour)) {
      assert.ok(count < 5000, `DOM mutations in simulated hour ${hour}: ${count}`);
    }
  },
);

test(
  "real-clock cadence runs at most one scroll callback per slot per frame",
  { timeout: 120000 },
  async () => {
    const runtime = await loadValidationPuppeteer();
    const browser = await runtime.puppeteer.launch(runtime.launchOptions);
    let result;
    try {
      result = await measureRealTickCadence(browser, { durationMs: 6000 });
    } finally {
      await browser.close();
    }

    assert.ok(result.frames > 10, "page produced animation frames");
    assert.ok(
      result.maxTicksPerFrame <= Math.max(result.scrollingSlots, 1),
      `scroll callbacks per frame ${result.maxTicksPerFrame} > scrolling slots ${result.scrollingSlots}`,
    );
    assert.ok(result.maxPendingTicks <= 3, `pending ticks ${result.maxPendingTicks}`);
  },
);
