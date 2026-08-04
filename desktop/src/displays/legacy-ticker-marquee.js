(function installLegacyTickerMarquee(global) {
  "use strict";

  if (typeof global.createLegacyTickerMarquee === "function") {
    return;
  }

  var LOOP_GAP = "\u00A0\u00A0\u00A0•\u00A0\u00A0\u00A0";

  function createLegacyTickerMarquee(config) {
    config = config || {};
    var V = config.speedPxPerSecond != null ? config.speedPxPerSecond : 40;
    var EASE_SEC = config.easeSec != null ? config.easeSec : 1;
    var PAUSE_MS = config.pauseMs != null ? config.pauseMs : 4000;
    var EPS = config.eps != null ? config.eps : 0.5;
    var OVERFLOW_TOLERANCE_PX =
      config.overflowTolerancePx != null ? config.overflowTolerancePx : 2;
    var END_REVEAL_PADDING_PX =
      config.endRevealPaddingPx != null ? config.endRevealPaddingPx : 2;
    var MEASURE_EPS = config.measureEps != null ? config.measureEps : 0.5;
    var rafs = new WeakMap();

    function cancelLoop(container) {
      if (rafs.has(container)) {
        cancelAnimationFrame(rafs.get(container));
        rafs.delete(container);
      }
    }

    function measureIntrinsicWidth(el) {
      if (!el) return 0;
      return Math.max(el.scrollWidth || 0, el.offsetWidth || 0);
    }

    function resetInnerTransformForMeasure(inner) {
      if (!inner) {
        return function restore() {};
      }
      var savedTransform = inner.style.transform;
      inner.style.transform = "translate3d(0,0,0)";
      return function restoreTransform() {
        inner.style.transform = savedTransform;
      };
    }

    function escapeHTML(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function buildTrackResult(input) {
      var primaryTitleWidth = input.primaryTitleWidth != null ? input.primaryTitleWidth : input.textWidth || 0;
      var spacerWidth = input.spacerWidth != null ? input.spacerWidth : 0;
      var loopDistance =
        input.loopDistance != null
          ? input.loopDistance
          : input.width != null
            ? input.width
            : primaryTitleWidth + spacerWidth;
      return {
        mode: input.mode,
        width: loopDistance,
        shouldScroll: input.shouldScroll === true,
        viewportWidth: input.viewportWidth != null ? input.viewportWidth : 0,
        textWidth: primaryTitleWidth,
        primaryTitleWidth: primaryTitleWidth,
        spacerWidth: spacerWidth,
        cloneTitleWidth: input.cloneTitleWidth != null ? input.cloneTitleWidth : primaryTitleWidth,
        loopDistance: loopDistance,
        overflowPx: input.overflowPx != null ? input.overflowPx : 0,
        overflowTolerancePx: OVERFLOW_TOLERANCE_PX,
        totalTravelDistance: input.totalTravelDistance != null ? input.totalTravelDistance : loopDistance,
        easeDistance: input.easeDistance != null ? input.easeDistance : 0,
        cruiseDistance: input.cruiseDistance != null ? input.cruiseDistance : 0,
        trackBuilt: input.trackBuilt === true,
        spacerPresent: input.spacerPresent === true,
        clonePresent: input.clonePresent === true,
        nearThresholdOverflow:
          input.overflowPx > 0 && input.overflowPx <= OVERFLOW_TOLERANCE_PX + MEASURE_EPS,
        microAnimationPrevented: input.microAnimationPrevented === true,
        unstableMeasurement: input.unstableMeasurement === true,
        firstLoopFailureStage: input.firstLoopFailureStage || null,
      };
    }

    function computeLoopKinematics(loopWidth) {
      var safeLoopWidth = Math.max(loopWidth, 1e-6);
      var acceleration = V / EASE_SEC;
      var defaultEaseDistance = 0.5 * acceleration * EASE_SEC * EASE_SEC;
      var maxEaseDistance = safeLoopWidth / 2;
      var easeDistance = Math.min(defaultEaseDistance, maxEaseDistance);
      var cruiseDistance = Math.max(0, safeLoopWidth - 2 * easeDistance);
      var cruiseSec = cruiseDistance / V;
      var totalSec = EASE_SEC + cruiseSec + EASE_SEC;
      return {
        loopWidth: safeLoopWidth,
        easeDistance: easeDistance,
        cruiseDistance: cruiseDistance,
        cruiseSec: cruiseSec,
        totalSec: totalSec,
        totalMs: totalSec * 1000,
        acceleration: acceleration,
      };
    }

    function buildLoopTrack(inner, text) {
      var sig = "loop:" + text;
      var copyA = inner.querySelector(".copyA");
      var gapEl = inner.querySelector(".gap");
      var copyB = inner.querySelector(".copyB");
      if (inner.getAttribute("data-built") !== sig || !copyA || !gapEl || !copyB) {
        inner.innerHTML =
          '<span class="copyA">' + escapeHTML(text) + "</span>" +
          '<span class="gap" aria-hidden="true">' + LOOP_GAP + "</span>" +
          '<span class="copyB" aria-hidden="true">' + escapeHTML(text) + "</span>";
        inner.setAttribute("data-built", sig);
        copyA = inner.querySelector(".copyA");
        gapEl = inner.querySelector(".gap");
        copyB = inner.querySelector(".copyB");
      }
      var primaryTitleWidth = copyA ? measureIntrinsicWidth(copyA) : 0;
      var spacerWidth = gapEl ? measureIntrinsicWidth(gapEl) : 0;
      var cloneTitleWidth = copyB ? measureIntrinsicWidth(copyB) : primaryTitleWidth;
      var loopDistance = (primaryTitleWidth + spacerWidth) || 1e-6;

      return {
        copyA: copyA,
        gapEl: gapEl,
        copyB: copyB,
        primaryTitleWidth: primaryTitleWidth,
        spacerWidth: spacerWidth,
        cloneTitleWidth: cloneTitleWidth,
        loopDistance: loopDistance,
        trackBuilt: Boolean(copyA && gapEl && copyB),
        spacerPresent: Boolean(gapEl),
        clonePresent: Boolean(copyB),
      };
    }

    function ensureTrack(container) {
      var inner = container ? container.querySelector(".inner") : null;
      if (!inner) {
        return buildTrackResult({ mode: "single", width: 0, shouldScroll: false });
      }

      var text = (container.getAttribute("data-title") || inner.textContent || "—").trim() || "—";
      var viewportWidth = container.clientWidth;
      var restoreTransform = resetInnerTransformForMeasure(inner);

      try {
        if (container.classList.contains("fade-out")) {
          var fadeWidth = measureIntrinsicWidth(inner);
          var fadeOverflow = Math.max(0, fadeWidth - viewportWidth);
          if (fadeOverflow <= OVERFLOW_TOLERANCE_PX) {
            return buildTrackResult({
              mode: "single",
              width: fadeWidth,
              shouldScroll: false,
              viewportWidth: viewportWidth,
              textWidth: fadeWidth,
              primaryTitleWidth: fadeWidth,
              overflowPx: fadeOverflow,
            });
          }
          var fadeLoop = buildLoopTrack(inner, text);
          if (!fadeLoop.trackBuilt) {
            return buildTrackResult({
              mode: "single",
              width: fadeWidth,
              shouldScroll: false,
              viewportWidth: viewportWidth,
              textWidth: fadeWidth,
              primaryTitleWidth: fadeWidth,
              overflowPx: fadeOverflow,
              firstLoopFailureStage: fadeLoop.spacerPresent ? "clone_missing" : "spacer_missing",
            });
          }
          var fadeKinematics = computeLoopKinematics(fadeLoop.loopDistance);
          return buildTrackResult({
            mode: "loop",
            width: fadeKinematics.loopWidth,
            shouldScroll: true,
            viewportWidth: viewportWidth,
            textWidth: fadeLoop.primaryTitleWidth,
            primaryTitleWidth: fadeLoop.primaryTitleWidth,
            spacerWidth: fadeLoop.spacerWidth,
            cloneTitleWidth: fadeLoop.cloneTitleWidth,
            loopDistance: fadeLoop.loopDistance,
            overflowPx: fadeOverflow,
            totalTravelDistance: fadeKinematics.loopWidth,
            easeDistance: fadeKinematics.easeDistance,
            cruiseDistance: fadeKinematics.cruiseDistance,
            trackBuilt: fadeLoop.trackBuilt,
            spacerPresent: fadeLoop.spacerPresent,
            clonePresent: fadeLoop.clonePresent,
          });
        }

        inner.textContent = text;
        inner.removeAttribute("data-built");
        var singleW = measureIntrinsicWidth(inner);
        var lastMeasured = parseFloat(inner.getAttribute("data-last-text-width") || "0");
        if (
          lastMeasured > 0 &&
          Math.abs(lastMeasured - singleW) > MEASURE_EPS &&
          inner.getAttribute("data-built") &&
          inner.getAttribute("data-built").indexOf("loop:") === 0
        ) {
          inner.removeAttribute("data-built");
        }
        inner.setAttribute("data-last-text-width", String(singleW));

        var overflowPx = Math.max(0, singleW - viewportWidth);
        var shouldScroll = overflowPx > OVERFLOW_TOLERANCE_PX;

        if (!shouldScroll) {
          inner.setAttribute("data-built", "single");
          inner.style.transform = "translate3d(0,0,0)";
          return buildTrackResult({
            mode: "single",
            width: singleW,
            shouldScroll: false,
            viewportWidth: viewportWidth,
            textWidth: singleW,
            primaryTitleWidth: singleW,
            overflowPx: overflowPx,
            trackBuilt: false,
            spacerPresent: false,
            clonePresent: false,
          });
        }

        var loopParts = buildLoopTrack(inner, text);
        if (!loopParts.trackBuilt) {
          return buildTrackResult({
            mode: "single",
            width: singleW,
            shouldScroll: false,
            viewportWidth: viewportWidth,
            textWidth: singleW,
            primaryTitleWidth: singleW,
            overflowPx: overflowPx,
            firstLoopFailureStage: loopParts.spacerPresent ? "clone_missing" : "spacer_missing",
            microAnimationPrevented: true,
          });
        }

        if (!loopParts.spacerPresent || !loopParts.clonePresent) {
          return buildTrackResult({
            mode: "single",
            width: singleW,
            shouldScroll: false,
            viewportWidth: viewportWidth,
            textWidth: singleW,
            primaryTitleWidth: singleW,
            overflowPx: overflowPx,
            firstLoopFailureStage: loopParts.spacerPresent ? "clone_missing" : "spacer_missing",
            microAnimationPrevented: true,
          });
        }

        var minLoopWidth = overflowPx + END_REVEAL_PADDING_PX + loopParts.spacerWidth;
        if (
          loopParts.loopDistance + MEASURE_EPS < minLoopWidth ||
          loopParts.primaryTitleWidth + MEASURE_EPS < overflowPx
        ) {
          return buildTrackResult({
            mode: "single",
            width: singleW,
            shouldScroll: false,
            viewportWidth: viewportWidth,
            textWidth: singleW,
            primaryTitleWidth: singleW,
            overflowPx: overflowPx,
            unstableMeasurement: true,
            microAnimationPrevented: true,
            firstLoopFailureStage: "track_measurement_unstable",
          });
        }

        var kinematics = computeLoopKinematics(loopParts.loopDistance);
        return buildTrackResult({
          mode: "loop",
          width: kinematics.loopWidth,
          shouldScroll: true,
          viewportWidth: viewportWidth,
          textWidth: loopParts.primaryTitleWidth,
          primaryTitleWidth: loopParts.primaryTitleWidth,
          spacerWidth: loopParts.spacerWidth,
          cloneTitleWidth: loopParts.cloneTitleWidth,
          loopDistance: loopParts.loopDistance,
          overflowPx: overflowPx,
          totalTravelDistance: kinematics.loopWidth,
          easeDistance: kinematics.easeDistance,
          cruiseDistance: kinematics.cruiseDistance,
          trackBuilt: true,
          spacerPresent: true,
          clonePresent: true,
        });
      } finally {
        restoreTransform();
      }
    }

    function measureStableTrack(container, callback) {
      callback = typeof callback === "function" ? callback : function () {};

      var inner = container ? container.querySelector(".inner") : null;
      if (!inner) {
        callback(buildTrackResult({ mode: "single", shouldScroll: false }), {
          stableMeasurementUsed: false,
          measurementsDiffered: false,
        });
        return;
      }

      function afterFonts(next) {
        var doc = global.document;
        if (doc && doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === "function") {
          doc.fonts.ready.then(next).catch(next);
        } else {
          next();
        }
      }

      afterFonts(function () {
        var raf = global.requestAnimationFrame || function (fn) {
          return setTimeout(fn, 16);
        };
        raf(function () {
          var first = ensureTrack(container);
          raf(function () {
            var second = ensureTrack(container);
            var measurementsDiffered =
              Math.abs((first.primaryTitleWidth || 0) - (second.primaryTitleWidth || 0)) > MEASURE_EPS ||
              Math.abs((first.viewportWidth || 0) - (second.viewportWidth || 0)) > MEASURE_EPS;
            var stable = second;
            var meta = {
              firstMeasuredViewportWidth: first.viewportWidth || container.clientWidth,
              firstMeasuredTextWidth: first.primaryTitleWidth || 0,
              stableViewportWidth: second.viewportWidth || container.clientWidth,
              stableTextWidth: second.primaryTitleWidth || 0,
              measurementsDiffered: measurementsDiffered,
              stableMeasurementUsed: true,
              fontReady: true,
              layoutReady: true,
            };

            if (
              measurementsDiffered &&
              first.shouldScroll !== second.shouldScroll &&
              second.unstableMeasurement !== true
            ) {
              stable = second;
            }

            callback(stable, meta);
          });
        });
      });
    }

    function buildDiagnosticEntry(track, runtime, measureMeta, extra) {
      extra = extra || {};
      measureMeta = measureMeta || {};
      return {
        index: runtime.slotIndex != null ? runtime.slotIndex : null,
        viewportWidth: track.viewportWidth || 0,
        textWidth: track.primaryTitleWidth || track.textWidth || 0,
        primaryTitleWidth: track.primaryTitleWidth || track.textWidth || 0,
        spacerWidth: track.spacerWidth || 0,
        cloneTitleWidth: track.cloneTitleWidth || track.primaryTitleWidth || 0,
        loopDistance: track.loopDistance || track.width || 0,
        firstMeasuredViewportWidth: measureMeta.firstMeasuredViewportWidth,
        firstMeasuredTextWidth: measureMeta.firstMeasuredTextWidth,
        stableViewportWidth: measureMeta.stableViewportWidth,
        stableTextWidth: measureMeta.stableTextWidth,
        measurementsDiffered: measureMeta.measurementsDiffered === true,
        overflowPx: track.overflowPx || 0,
        overflowTolerancePx: track.overflowTolerancePx || OVERFLOW_TOLERANCE_PX,
        shouldScroll: track.shouldScroll === true,
        totalTravelDistance: track.totalTravelDistance || track.loopDistance || 0,
        easeDistance: track.easeDistance || 0,
        cruiseDistance: track.cruiseDistance || 0,
        durationMs: extra.durationMs || 0,
        stableMeasurementUsed: measureMeta.stableMeasurementUsed === true,
        trackBuilt: track.trackBuilt === true,
        spacerPresent: track.spacerPresent === true,
        clonePresent: track.clonePresent === true,
        nearThresholdOverflow: track.nearThresholdOverflow === true,
        microAnimationPrevented: track.microAnimationPrevented === true,
        firstFailureStage: extra.firstFailureStage || track.firstLoopFailureStage || null,
        firstLoopFailureStage: extra.firstLoopFailureStage || track.firstLoopFailureStage || null,
        fullTravelCompleted: extra.fullTravelCompleted === true,
        resetReason: extra.resetReason || null,
        animationRunning: extra.animationRunning === true,
        finalPositionReached: extra.finalPositionReached === true,
        loopCompletedCount: extra.loopCompletedCount || 0,
        seamlessResetConfirmed: extra.seamlessResetConfirmed === true,
        restartCount: extra.restartCount || 0,
      };
    }

    function startMarqueeWithTrack(container, track, runtime, measureMeta) {
      runtime = runtime || {};
      measureMeta = measureMeta || {};
      cancelLoop(container);

      var inner = container ? container.querySelector(".inner") : null;
      if (!inner) return;

      if (typeof runtime.shouldStart === "function" && runtime.shouldStart(container) === false) {
        return;
      }

      if (inner.classList.contains("is-frozen")) {
        return;
      }

      var loopCompletedCount = 0;
      var diagEntry = buildDiagnosticEntry(track, runtime, measureMeta, {
        animationRunning: false,
      });

      if (track.mode === "single" || track.shouldScroll !== true) {
        inner.style.transform = "translate3d(0,0,0)";
        if (typeof runtime.onDiagnostic === "function") {
          runtime.onDiagnostic(diagEntry);
        }
        return;
      }

      if (Math.abs((track.loopDistance || 0) - ((track.primaryTitleWidth || 0) + (track.spacerWidth || 0))) > MEASURE_EPS) {
        diagEntry.firstLoopFailureStage = "loop_distance_uses_overflow_only";
        if (typeof runtime.onDiagnostic === "function") {
          runtime.onDiagnostic(diagEntry);
        }
        return;
      }

      var kinematics = computeLoopKinematics(track.loopDistance || track.width);
      var loopWidth = kinematics.loopWidth;
      var easeDistance = kinematics.easeDistance;
      var cruiseDistance = kinematics.cruiseDistance;
      var cruiseSec = kinematics.cruiseSec;
      var totalSec = kinematics.totalSec;
      var totalMs = kinematics.totalMs;
      var acceleration = kinematics.acceleration;

      diagEntry.totalTravelDistance = loopWidth;
      diagEntry.easeDistance = easeDistance;
      diagEntry.cruiseDistance = cruiseDistance;
      diagEntry.durationMs = Math.round(totalMs + PAUSE_MS);
      diagEntry.trackBuilt = track.trackBuilt === true;
      diagEntry.spacerPresent = track.spacerPresent === true;
      diagEntry.clonePresent = track.clonePresent === true;
      diagEntry.loopDistance = loopWidth;

      var phase = "prepause";
      var startedAt = performance.now();

      function distanceAt(ms) {
        var seconds = ms / 1000;
        var distance = 0;
        if (seconds <= 0) {
          distance = 0;
        } else if (seconds <= EASE_SEC) {
          distance = 0.5 * acceleration * seconds * seconds;
        } else if (seconds <= EASE_SEC + cruiseSec) {
          distance = easeDistance + V * (seconds - EASE_SEC);
        } else if (seconds <= totalSec) {
          var tail = seconds - (EASE_SEC + cruiseSec);
          distance = easeDistance + cruiseDistance + (V * tail - 0.5 * acceleration * tail * tail);
        } else {
          distance = loopWidth;
        }
        return Math.min(Math.max(distance, 0), loopWidth);
      }

      function publishDiagnostic(extra) {
        var next = buildDiagnosticEntry(track, runtime, measureMeta, Object.assign({}, diagEntry, extra || {}));
        diagEntry = next;
        if (typeof runtime.onDiagnostic === "function") {
          runtime.onDiagnostic(next);
        }
      }

      function tick(now) {
        var frameId = requestAnimationFrame(tick);
        rafs.set(container, frameId);

        if (inner.classList.contains("is-frozen")) {
          cancelLoop(container);
          publishDiagnostic({ resetReason: "frozen", animationRunning: false });
          return;
        }

        if (typeof runtime.shouldAbort === "function" && runtime.shouldAbort(container) === true) {
          cancelLoop(container);
          publishDiagnostic({ resetReason: "aborted", animationRunning: false });
          return;
        }

        if (phase === "prepause") {
          inner.style.transform = "translate3d(0,0,0)";
          if (now - startedAt >= PAUSE_MS) {
            phase = "scroll";
            startedAt = now;
            publishDiagnostic({ animationRunning: true, resetReason: null });
          }
          return;
        }

        var elapsed = now - startedAt;
        if (elapsed >= totalMs - 0.1) {
          inner.style.transform = "translate3d(" + (-loopWidth) + "px,0,0)";
          inner.style.transform = "translate3d(0,0,0)";
          loopCompletedCount += 1;
          phase = "prepause";
          startedAt = now;
          publishDiagnostic({
            animationRunning: true,
            fullTravelCompleted: true,
            finalPositionReached: true,
            seamlessResetConfirmed: true,
            resetReason: "cycle_complete",
            loopCompletedCount: loopCompletedCount,
          });
          return;
        }

        var distance = distanceAt(elapsed);
        inner.style.transform = "translate3d(" + (-distance) + "px,0,0)";
      }

      publishDiagnostic({ animationRunning: true });
      requestAnimationFrame(tick);
    }

    function startMarquee(container, runtime) {
      runtime = runtime || {};
      var track = ensureTrack(container);
      startMarqueeWithTrack(container, track, runtime, {
        stableMeasurementUsed: false,
      });
    }

    function startMarqueeStable(container, runtime) {
      runtime = runtime || {};
      measureStableTrack(container, function (track, measureMeta) {
        startMarqueeWithTrack(container, track, runtime, measureMeta);
      });
    }

    function hasActiveLoop(container) {
      return rafs.has(container);
    }

    return {
      speedPxPerSecond: V,
      easeSec: EASE_SEC,
      pauseMs: PAUSE_MS,
      eps: EPS,
      overflowTolerancePx: OVERFLOW_TOLERANCE_PX,
      endRevealPaddingPx: END_REVEAL_PADDING_PX,
      measureEps: MEASURE_EPS,
      loopGap: LOOP_GAP,
      cancelLoop: cancelLoop,
      ensureTrack: ensureTrack,
      measureStableTrack: measureStableTrack,
      startMarquee: startMarquee,
      startMarqueeStable: startMarqueeStable,
      measureWidth: measureIntrinsicWidth,
      hasActiveLoop: hasActiveLoop,
    };
  }

  global.createLegacyTickerMarquee = createLegacyTickerMarquee;
})(typeof window !== "undefined" ? window : globalThis);
