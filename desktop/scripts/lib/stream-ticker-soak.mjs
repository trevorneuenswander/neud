import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toFileUrl } from "./resolve-validation-browser.mjs";

/**
 * Accelerated Stream Ticker soak harness.
 *
 * Runs the real bundled Stream Ticker HTML, the real shared marquee module and the real
 * Stream Ticker runtime bridge inside Chromium with a virtual clock (requestAnimationFrame,
 * performance.now, setTimeout, setInterval). Hours of runtime then take seconds, while the
 * page still goes through the production code paths:
 *
 *   NEUDDisplay._publish -> neud:data event + postMessage + subscribers (three deliveries
 *   per snapshot, exactly like public/neud-display-runtime.js) -> placeNextLots ->
 *   ensureSlotMarquee / transitionSlot -> legacy ticker marquee loops.
 *
 * Instrumentation (all read-only; production code is not modified by the harness):
 *   - pending requestAnimationFrame callbacks named "tick" (one per live scroll loop)
 *   - total pending rAF callbacks and outstanding timers
 *   - largest translate3d magnitude ever written to a scrolling track
 *   - structural DOM mutations (childList / characterData / non-style attributes)
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

export const SOAK_FRAME_MS = 1000 / 60;

export const SOAK_TITLES = {
  longA:
    "1967 Ferrari 275 GTB/4 by Scaglietti Formerly Owned by Steve McQueen with Complete Documentation and Matching Numbers",
  longB:
    "1955 Mercedes-Benz 300 SL Gullwing Alloy Body Offered from a Single Family Collection Since New and Fully Restored",
  longC:
    "1970 Plymouth Hemi Cuda Convertible Numbers Matching with Documented Ownership History From New Delivery",
  shortA: "Ford GT",
  shortB: "1976 Cadillac Eldorado",
};

function buildSoakFixtureHtml() {
  const marquee = read("desktop/src/displays/legacy-ticker-marquee.js");
  const bridge = read("desktop/src/displays/stream-ticker-v2-bridge.js");
  const ticker = read("desktop/src/displays/bundled/stream-ticker-v1.html")
    .replace("/*__NEUD_LEGACY_TICKER_MARQUEE__*/", () => marquee)
    .replace("/*__NEUD_STREAM_TICKER_BRIDGE__*/", () => bridge)
    .replace(/\/displays\/pylon\/logo\.png/g, "data:image/gif;base64,R0lGODlhAQABAAAAACw=");

  // Same delivery shape as public/neud-display-runtime.js NEUDDisplay._publish:
  // neud:data CustomEvent + window.postMessage + subscribers.
  const runtimeStub = `<script>
window.NEUDDisplay = {
  _subscribers: [],
  _snapshot: null,
  subscribe: function (callback) {
    this._subscribers.push(callback);
    if (this._snapshot) callback(this._snapshot);
  },
  getSnapshot: function () { return this._snapshot; },
  signalReady: function () {},
  _publish: function (snapshot) {
    this._snapshot = snapshot;
    window.dispatchEvent(new CustomEvent("neud:data", { detail: snapshot }));
    window.postMessage(
      { source: "neud-runtime", type: "NEUD_DATA_UPDATE", version: 1, payload: snapshot },
      window.location.origin
    );
    for (var i = 0; i < this._subscribers.length; i++) this._subscribers[i](snapshot);
  }
};
</script>`;

  return ticker.replace("<body>", `<body>\n${runtimeStub}`);
}

/** Injected before any page script. Replaces the page clock with a deterministic one. */
const VIRTUAL_CLOCK_SOURCE = `(() => {
  var FRAME_MS = ${SOAK_FRAME_MS};
  var now = 1000;
  var frame = 0;
  var rafSeq = 1;
  var rafQueue = new Map();
  var rafRunning = null;
  var timerSeq = 1;
  var timers = new Map();
  var stats = {
    rafScheduled: 0,
    rafCancelled: 0,
    maxPendingTicks: 0,
    maxPendingRaf: 0,
    maxPendingTimers: 0,
    ticksPendingSamples: {},
    maxAbsTranslatePx: 0,
    mutationsByHour: {},
  };

  var realRaf = window.requestAnimationFrame.bind(window);
  window.__soakRealRaf = realRaf;
  performance.now = function () { return now; };
  window.requestAnimationFrame = function (callback) {
    var id = rafSeq++;
    rafQueue.set(id, callback);
    stats.rafScheduled += 1;
    return id;
  };
  window.cancelAnimationFrame = function (id) {
    if (rafQueue.delete(id) || (rafRunning && rafRunning.delete(id))) {
      stats.rafCancelled += 1;
    }
  };
  window.setTimeout = function (fn, ms) {
    var id = timerSeq++;
    timers.set(id, { due: now + (Number(ms) || 0), fn: fn, interval: 0 });
    return id;
  };
  window.setInterval = function (fn, ms) {
    var delay = Math.max(1, Number(ms) || 1);
    var id = timerSeq++;
    timers.set(id, { due: now + delay, fn: fn, interval: delay });
    return id;
  };
  window.clearTimeout = window.clearInterval = function (id) { timers.delete(id); };

  var trackInners = null;
  function sampleTransforms() {
    if (!trackInners || trackInners.length === 0) {
      trackInners = Array.from(document.querySelectorAll(".title-scroll .inner"));
    }
    for (var i = 0; i < trackInners.length; i++) {
      var value = trackInners[i].style.transform;
      if (!value) continue;
      var match = /translate3d\\(\\s*(-?[0-9.eE+-]+)px/.exec(value);
      if (match) {
        var magnitude = Math.abs(parseFloat(match[1]));
        if (magnitude > stats.maxAbsTranslatePx) stats.maxAbsTranslatePx = magnitude;
      }
    }
  }

  function countPendingTicks() {
    var ticks = 0;
    rafQueue.forEach(function (callback) {
      if (callback && callback.name === "tick") ticks += 1;
    });
    return ticks;
  }

  function runDueTimers() {
    var due = [];
    timers.forEach(function (timer, id) {
      if (timer.due <= now) due.push([id, timer]);
    });
    due.sort(function (a, b) { return a[1].due - b[1].due; });
    for (var i = 0; i < due.length; i++) {
      var id = due[i][0];
      var timer = due[i][1];
      if (!timers.has(id)) continue;
      if (timer.interval > 0) {
        timer.due = now + timer.interval;
      } else {
        timers.delete(id);
      }
      try { timer.fn(); } catch (error) { console.error("soak timer error", error); }
    }
  }

  function runRafBatch() {
    rafRunning = rafQueue;
    rafQueue = new Map();
    var ids = Array.from(rafRunning.keys());
    for (var i = 0; i < ids.length; i++) {
      var callback = rafRunning.get(ids[i]);
      if (!callback) continue;
      rafRunning.delete(ids[i]);
      try { callback(now); } catch (error) { console.error("soak raf error", error); }
    }
    rafRunning = null;
  }

  var observer = new MutationObserver(function (records) {
    var bucket = Math.floor((now - 1000) / 3600000);
    var counted = 0;
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      if (record.type === "attributes" && record.attributeName === "style") continue;
      counted += 1;
    }
    stats.mutationsByHour[bucket] = (stats.mutationsByHour[bucket] || 0) + counted;
  });
  document.addEventListener("DOMContentLoaded", function () {
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      attributes: true,
      subtree: true,
    });
  });

  window.__soak = {
    stats: stats,
    now: function () { return now; },
    frame: function () { return frame; },
    pendingTicks: countPendingTicks,
    pendingRaf: function () { return rafQueue.size; },
    pendingTimers: function () { return timers.size; },
    step: function () {
      frame += 1;
      now += FRAME_MS;
      runDueTimers();
      runRafBatch();
      sampleTransforms();
      var ticks = countPendingTicks();
      if (ticks > stats.maxPendingTicks) stats.maxPendingTicks = ticks;
      stats.ticksPendingSamples[ticks] = (stats.ticksPendingSamples[ticks] || 0) + 1;
      if (rafQueue.size > stats.maxPendingRaf) stats.maxPendingRaf = rafQueue.size;
      if (timers.size > stats.maxPendingTimers) stats.maxPendingTimers = timers.size;
    },
    advanceFrames: async function (count) {
      for (var i = 0; i < count; i++) {
        window.__soak.step();
        // Let promise continuations (document.fonts.ready) and mutation records flush.
        await Promise.resolve();
      }
    },
  };
})();`;

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function writeSoakFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-ticker-soak-"));
  const file = path.join(dir, "stream-ticker-soak.html");
  fs.writeFileSync(file, buildSoakFixtureHtml(), "utf8");
  return { dir, file };
}

/**
 * Runs the accelerated soak.
 *
 * @param browser Puppeteer browser
 * @param options.hours simulated hours (default 4)
 * @param options.seed PRNG seed for delivery jitter
 */
export async function runTickerSoak(browser, options = {}) {
  const hours = options.hours ?? 4;
  const seed = options.seed ?? 20260726;
  const fixture = writeSoakFixture();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 3840, height: 2160, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(VIRTUAL_CLOCK_SOURCE);
    await page.goto(toFileUrl(fixture.file), { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => typeof window.placeNextLots === "function", {
      timeout: 20000,
    });

    const result = await page.evaluate(
      async (params) => {
        const { hours, titles, seedValue } = params;
        let seedState = seedValue >>> 0;
        function random() {
          seedState = (seedState + 0x6d2b79f5) >>> 0;
          let t = seedState;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }

        const soak = window.__soak;
        const lotSets = [
          [
            { lot: "101", title: titles.longA },
            { lot: "102", title: titles.longB },
            { lot: "103", title: titles.shortA },
          ],
          [
            { lot: "102", title: titles.longB },
            { lot: "103", title: titles.shortA },
            { lot: "104", title: titles.longC },
          ],
          [
            { lot: "103", title: titles.shortA },
            { lot: "104", title: titles.longC },
            { lot: "105", title: titles.shortB },
          ],
        ];
        let lotSetIndex = 0;

        function publish() {
          window.NEUDDisplay._publish({
            streamTickerFeed: {
              next: lotSets[lotSetIndex % lotSets.length].map((lot) => ({ ...lot })),
            },
          });
        }

        const FRAMES_PER_SECOND = 60;
        const totalSeconds = Math.round(hours * 3600);
        const hourly = [];
        let publishes = 0;
        let reconnects = 0;
        let resizes = 0;
        let rotations = 0;
        let quietChecks = 0;
        const quietMismatches = [];

        // Initial snapshot, then let measurement + first transitions settle.
        publish();
        publishes += 1;
        await soak.advanceFrames(FRAMES_PER_SECOND * 2);

        for (let second = 1; second <= totalSeconds; second += 1) {
          // Live feed: the runtime republishes the same snapshot on every change event.
          // Random sub-second offsets so deliveries land inside measurement windows,
          // fade transitions and cycle boundaries.
          const deliveryFrame = Math.floor(random() * FRAMES_PER_SECOND);
          const burst = random() < 0.15 ? 3 : 1;
          let eventAtFrame = -1;
          let eventKind = null;

          if (second % 1800 === 0) {
            eventKind = "resize";
            eventAtFrame = Math.floor(random() * FRAMES_PER_SECOND);
          } else if (second % 600 === 0) {
            eventKind = "rotate";
            eventAtFrame = Math.floor(random() * FRAMES_PER_SECOND);
          } else if (second % 300 === 0) {
            eventKind = "reconnect";
            eventAtFrame = Math.floor(random() * FRAMES_PER_SECOND);
          } else if (second % 60 === 0) {
            eventKind = "watchdog";
            eventAtFrame = Math.floor(random() * FRAMES_PER_SECOND);
          }

          for (let frame = 0; frame < FRAMES_PER_SECOND; frame += 1) {
            if (frame === deliveryFrame) {
              for (let b = 0; b < burst; b += 1) {
                publish();
                publishes += 1;
              }
            }
            if (frame === eventAtFrame) {
              if (eventKind === "rotate") {
                lotSetIndex += 1;
                rotations += 1;
                publish();
                publishes += 1;
              } else if (eventKind === "reconnect") {
                // EventSource reconnect => neud-display-bridge.sync => immediate refetch and
                // republish; the recovery watchdog fires an extra fetch at the same time.
                reconnects += 1;
                publish();
                publish();
                publishes += 2;
              } else if (eventKind === "resize") {
                resizes += 1;
                window.dispatchEvent(new Event("resize"));
              } else if (eventKind === "watchdog") {
                publish();
                publishes += 1;
              }
            }
            soak.step();
            await Promise.resolve();
          }

          // Quiet point (no scheduled event within the last 30 simulated seconds on a
          // 60 s boundary): every scrolling slot must have exactly one live loop.
          if (second % 60 === 30) {
            const diagnostics = window.__streamTickerMarqueeDiagnostics || {};
            const scrolling = (diagnostics.slots || []).filter(
              (slot) => slot && slot.shouldScroll,
            ).length;
            const ticks = soak.pendingTicks();
            quietChecks += 1;
            if (ticks !== scrolling) {
              quietMismatches.push({ second, ticks, scrolling });
            }
          }

          if (second % 3600 === 30) {
            const diagnostics = window.__streamTickerMarqueeDiagnostics || {};
            hourly.push({
              hour: Math.floor(second / 3600) + 1,
              pendingTicks: soak.pendingTicks(),
              pendingRaf: soak.pendingRaf(),
              pendingTimers: soak.pendingTimers(),
              scrollingSlots: (diagnostics.slots || []).filter((slot) => slot && slot.shouldScroll)
                .length,
              maxPendingTicksSoFar: soak.stats.maxPendingTicks,
              maxAbsTranslatePx: soak.stats.maxAbsTranslatePx,
            });
          }
        }

        // Let the final transition settle and sample steady state.
        await soak.advanceFrames(FRAMES_PER_SECOND * 3);

        const diagnostics = window.__streamTickerMarqueeDiagnostics || {};
        const slots = (diagnostics.slots || []).map((slot) =>
          slot
            ? {
                index: slot.index,
                shouldScroll: slot.shouldScroll,
                animationRunning: slot.animationRunning,
                loopDistance: slot.loopDistance,
                viewportWidth: slot.viewportWidth,
              }
            : null,
        );
        const scrollingSlots = slots.filter((slot) => slot && slot.shouldScroll).length;

        // Steady-state: sample 30 sim seconds and verify exactly the expected loop count
        // and that every scrolling track moves monotonically within one cycle.
        const steady = [];
        for (let i = 0; i < 30 * FRAMES_PER_SECOND; i += 1) {
          soak.step();
          await Promise.resolve();
          if (i % FRAMES_PER_SECOND === 0) steady.push(soak.pendingTicks());
        }

        return {
          hours,
          publishes,
          reconnects,
          resizes,
          rotations,
          frames: soak.frame(),
          stats: soak.stats,
          hourly,
          quietChecks,
          quietMismatches: quietMismatches.slice(0, 20),
          quietMismatchCount: quietMismatches.length,
          slots,
          scrollingSlots,
          steadyPendingTicks: steady,
          pendingTicksAtEnd: soak.pendingTicks(),
          pendingRafAtEnd: soak.pendingRaf(),
          pendingTimersAtEnd: soak.pendingTimers(),
          diagnostics: {
            refreshCount: diagnostics.refreshCount,
            destructiveRefreshCount: diagnostics.destructiveRefreshCount,
            activeAnimationCount: diagnostics.activeAnimationCount,
          },
        };
      },
      { hours, titles: SOAK_TITLES, seedValue: seed },
    );

    return result;
  } finally {
    await page.close().catch(() => {});
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  }
}

/**
 * Real-clock cadence check: counts how many scroll-loop callbacks run per animation frame in a
 * real (non-virtual) page. Informational frame statistics are returned; the caller asserts on
 * ticksPerFrame only, because headless frame timing is machine dependent.
 */
export async function measureRealTickCadence(browser, options = {}) {
  const durationMs = options.durationMs ?? 6000;
  const fixture = writeSoakFixture();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 3840, height: 2160, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(`(() => {
      var realRaf = window.requestAnimationFrame.bind(window);
      var realCancel = window.cancelAnimationFrame.bind(window);
      var pending = new Map();
      var frameDeltas = [];
      var lastFrameAt = null;
      var perFrameTicks = {};
      window.__cadence = { frameDeltas: frameDeltas, perFrameTicks: perFrameTicks, maxPendingTicks: 0 };
      window.requestAnimationFrame = function (callback) {
        var name = callback && callback.name;
        var id = realRaf(function (ts) {
          pending.delete(id);
          if (name === "tick") {
            var key = String(Math.round(ts));
            perFrameTicks[key] = (perFrameTicks[key] || 0) + 1;
          }
          callback(ts);
        });
        pending.set(id, name);
        var ticks = 0;
        pending.forEach(function (entryName) { if (entryName === "tick") ticks += 1; });
        if (ticks > window.__cadence.maxPendingTicks) window.__cadence.maxPendingTicks = ticks;
        return id;
      };
      window.cancelAnimationFrame = function (id) { pending.delete(id); realCancel(id); };
      realRaf(function loop(ts) {
        if (lastFrameAt !== null) frameDeltas.push(ts - lastFrameAt);
        lastFrameAt = ts;
        realRaf(loop);
      });
    })();`);
    await page.goto(toFileUrl(fixture.file), { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => typeof window.placeNextLots === "function", {
      timeout: 20000,
    });
    await page.evaluate((titles) => {
      const lots = [
        { lot: "101", title: titles.longA },
        { lot: "102", title: titles.longB },
        { lot: "103", title: titles.shortA },
      ];
      // Three deliveries per snapshot, repeated, like the live runtime.
      for (let i = 0; i < 6; i += 1) {
        window.NEUDDisplay._publish({ streamTickerFeed: { next: lots } });
      }
    }, SOAK_TITLES);
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    return await page.evaluate(() => {
      const cadence = window.__cadence;
      const deltas = cadence.frameDeltas.slice();
      const perFrame = Object.values(cadence.perFrameTicks);
      const diagnostics = window.__streamTickerMarqueeDiagnostics || {};
      return {
        frames: deltas.length,
        longFrames: deltas.filter((delta) => delta > 50).length,
        maxFrameDelta: deltas.reduce((max, delta) => Math.max(max, delta), 0),
        maxTicksPerFrame: perFrame.reduce((max, count) => Math.max(max, count), 0),
        maxPendingTicks: cadence.maxPendingTicks,
        scrollingSlots: (diagnostics.slots || []).filter((slot) => slot && slot.shouldScroll).length,
      };
    });
  } finally {
    await page.close().catch(() => {});
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  }
}

/**
 * Deterministic regression for the root cause: overlapping start/cancel requests on one
 * container must never leave more than one live scroll loop (and none after a cancel).
 */
export async function runMarqueeOverlapChecks(browser) {
  const fixture = writeSoakFixture();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 3840, height: 2160, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(VIRTUAL_CLOCK_SOURCE);
    await page.goto(toFileUrl(fixture.file), { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => typeof window.createLegacyTickerMarquee === "function", {
      timeout: 20000,
    });
    return await page.evaluate(async (title) => {
      const soak = window.__soak;
      const marquee = window.createLegacyTickerMarquee({ speedPxPerSecond: 40 });

      function makeContainer() {
        const container = document.createElement("span");
        container.className = "title-scroll";
        container.style.cssText = "display:block;width:400px;overflow:hidden;white-space:nowrap;font-size:45px;";
        container.setAttribute("data-title", title);
        container.innerHTML = '<span class="inner"></span>';
        container.querySelector(".inner").textContent = title;
        document.body.appendChild(container);
        return container;
      }

      async function settle(frames) {
        await soak.advanceFrames(frames);
      }

      const results = {};
      let base = 0;

      // 1. Three overlapping stable starts (the bridge delivers each snapshot three times).
      base = soak.pendingTicks();
      let container = makeContainer();
      marquee.startMarqueeStable(container, {});
      marquee.startMarqueeStable(container, {});
      marquee.startMarqueeStable(container, {});
      await settle(30);
      results.overlappingStableStarts = soak.pendingTicks() - base;

      // 2. Two starts before the first animation frame of the first one ran.
      base = soak.pendingTicks();
      container = makeContainer();
      await settle(10);
      marquee.startMarquee(container, {});
      marquee.startMarquee(container, {});
      await settle(5);
      results.syncDoubleStart = soak.pendingTicks() - base;

      // 3. Cancel after measurement but before the first tick of the loop.
      base = soak.pendingTicks();
      container = makeContainer();
      marquee.startMarqueeStable(container, {});
      for (let i = 0; i < 400 && !marquee.hasActiveLoop(container); i += 1) {
        await settle(1);
      }
      marquee.cancelLoop(container);
      await settle(10);
      results.cancelledBeforeTick = {
        liveLoopsAfterCancel: soak.pendingTicks() - base,
        hasActiveLoop: marquee.hasActiveLoop(container),
      };

      // 4. Cancel while a measurement is still pending: the late callback must not start.
      base = soak.pendingTicks();
      container = makeContainer();
      marquee.startMarqueeStable(container, {});
      marquee.cancelLoop(container);
      await settle(30);
      results.cancelledWhileMeasuring = {
        liveLoops: soak.pendingTicks() - base,
        hasActiveLoop: marquee.hasActiveLoop(container),
      };

      // 5. Many restarts over time never accumulate loops.
      base = soak.pendingTicks();
      container = makeContainer();
      for (let i = 0; i < 200; i += 1) {
        marquee.startMarqueeStable(container, {});
        await settle(i % 7);
      }
      await settle(30);
      results.manyRestarts = soak.pendingTicks() - base;
      return results;
    }, SOAK_TITLES.longA);
  } finally {
    await page.close().catch(() => {});
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  }
}
