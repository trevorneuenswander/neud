window.__NEUD_TICKER_REVISION__ =
  "auction-ticker-legacy-live-v1-2026-07-26-132400";

/* ===== NEUD live-data bridge ===== */

(function initializeNeudTickerBridge() {
  "use strict";

  if (window.__NEUD_LEGACY_TICKER_ADAPTER_INSTALLED__) {
    return;
  }

  let hasReceivedNeudData = false;
  let fallbackPollTimer = null;
  let diagnosticsInitialized = false;

  function updateLegacyDiagnostics(fields) {
    window.__neudLegacyDisplayDiagnostics = Object.assign(
      {
        adapter: "legacy-ticker",
        inputReceived: false,
        subscriberCount:
          window.NEUDDisplay && Array.isArray(window.NEUDDisplay._subscribers)
            ? window.NEUDDisplay._subscribers.length
            : 0,
        currentLotResolved: false,
        bidResolved: false,
        upcomingLotCount: 0,
        renderCompleted: false,
        skipReason: null,
        canonicalRevision: null,
      },
      window.__neudLegacyDisplayDiagnostics || {},
      fields || {},
    );

    try {
      if (window.parent !== window) {
        window.parent.postMessage(
          {
            source: "neud-display",
            type: "NEUD_RENDER_STATUS",
            version: 1,
            adapter: "legacy-ticker",
            renderCompleted: Boolean(fields && fields.renderCompleted),
          },
          "*",
        );
      }
    } catch (_) {}
  }

  function initDiagnostics() {
    if (diagnosticsInitialized) {
      return;
    }
    diagnosticsInitialized = true;

    console.info("[legacy-live-ticker] init", {
      revision: window.__NEUD_TICKER_REVISION__,
      href: window.location.href,
      hasNEUDDisplay: Boolean(window.NEUDDisplay),
      isIframe: window.parent !== window,
    });

    window.addEventListener("error", function (event) {
      console.error(
        "[legacy-live-ticker] window error",
        event.error || event.message,
      );
    });

    window.addEventListener("unhandledrejection", function (event) {
      console.error("[legacy-live-ticker] unhandled rejection", event.reason);
    });
  }

  function unwrapNeudMessage(message) {
    if (!message || typeof message !== "object") {
      return null;
    }

    if (
      message.type === "NEUD_DATA_UPDATE" &&
      message.payload &&
      typeof message.payload === "object"
    ) {
      return message.payload;
    }

    if (
      message.source === "neud-runtime" &&
      message.payload &&
      typeof message.payload === "object"
    ) {
      return message.payload;
    }

    return message;
  }

  function resolveBroadArrowTickerData(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    if (Array.isArray(payload.next)) {
      return { next: payload.next };
    }

    if (Array.isArray(payload.lots)) {
      return payload;
    }

    return null;
  }

  function adaptUpcomingLot(lot) {
    if (!lot || typeof lot !== "object") {
      return { lot: "", title: "" };
    }

    return {
      lot:
        lot.lot === null || lot.lot === undefined
          ? ""
          : String(lot.lot).trim(),
      title:
        lot.title === null || lot.title === undefined
          ? ""
          : String(lot.title).trim(),
    };
  }

  function stopFallbackPolling() {
    if (fallbackPollTimer !== null) {
      clearInterval(fallbackPollTimer);
      fallbackPollTimer = null;
    }
  }

  function logRenderedDom() {
    console.info("[legacy-live-ticker] rendered DOM", {
      slot1Lot: document.getElementById("slot1Lot")?.textContent,
      slot1Title: document.getElementById("slot1Title")?.textContent,
      slot2Lot: document.getElementById("slot2Lot")?.textContent,
      slot2Title: document.getElementById("slot2Title")?.textContent,
      slot3Lot: document.getElementById("slot3Lot")?.textContent,
      slot3Title: document.getElementById("slot3Title")?.textContent,
    });
  }

  function renderNeudTickerData(rawMessage) {
    const payload = unwrapNeudMessage(rawMessage);

    console.info("[legacy-live-ticker] update", {
      topLevelKeys: Object.keys(payload || {}),
      hasBroadArrowDisplay: Boolean(payload?.broadArrowDisplay),
      tickerNext: payload?.broadArrowDisplay?.ticker?.next,
      next: Array.isArray(payload?.next) ? payload.next.slice(0, 3) : null,
    });

    const tickerData = resolveBroadArrowTickerData(payload);

    if (!tickerData) {
      updateLegacyDiagnostics({
        inputReceived: true,
        renderCompleted: false,
        skipReason: "missing_ticker_data",
      });
      return;
    }

    const normalized = normalize(tickerData);

    if (!normalized || !Array.isArray(normalized.next)) {
      updateLegacyDiagnostics({
        inputReceived: true,
        renderCompleted: false,
        skipReason: "missing_next_lots",
      });
      return;
    }

    const compatibleNext = normalized.next.map(adaptUpcomingLot);

    console.info("[legacy-live-ticker] rendering", compatibleNext);

    hasReceivedNeudData = true;
    stopFallbackPolling();

    placeNextLots(compatibleNext);

    if (statusEl) {
      statusEl.textContent = "";
    }

    logRenderedDom();

    updateLegacyDiagnostics({
      inputReceived: true,
      upcomingLotCount: compatibleNext.length,
      renderCompleted: true,
      skipReason: null,
      canonicalRevision:
        payload && payload.revision != null ? String(payload.revision) : null,
    });
  }

  window.addEventListener("message", function onNeudMessage(event) {
    const message = event.data;

    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "NEUD_DATA_UPDATE" || message.source === "neud-runtime") {
      renderNeudTickerData(message);
    }
  });

  window.addEventListener("neud:data", function onNeudDataEvent(event) {
    if (event.detail) {
      renderNeudTickerData(event.detail);
    }
  });

  function signalDisplayReady() {
    const readyMessage = {
      source: "neud-display",
      type: "NEUD_DISPLAY_READY",
    };

    try {
      window.postMessage(readyMessage, window.location.origin);
    } catch (error) {
      console.warn("[legacy-live-ticker] window ready signal failed:", error);
    }

    if (window.parent !== window) {
      try {
        window.parent.postMessage(readyMessage, window.location.origin);
      } catch (error) {
        console.warn("[legacy-live-ticker] parent ready signal failed:", error);
      }
    }
  }

  function subscribeToNeudRuntime() {
    if (
      !window.NEUDDisplay ||
      typeof window.NEUDDisplay.subscribe !== "function"
    ) {
      return false;
    }

    if (typeof window.placeNextLots !== "function") {
      return false;
    }

    if (typeof window.NEUDDisplay.getSnapshot === "function") {
      const existingSnapshot = window.NEUDDisplay.getSnapshot();

      if (existingSnapshot) {
        console.info("[legacy-live-ticker] existing snapshot", existingSnapshot);
        renderNeudTickerData(existingSnapshot);
      }
    }

    window.__NEUD_LEGACY_TICKER_ADAPTER_UNSUBSCRIBE__ =
      window.NEUDDisplay.subscribe(function onNeudSnapshot(snapshot) {
        renderNeudTickerData(snapshot);
      });

    window.__NEUD_LEGACY_TICKER_ADAPTER_INSTALLED__ = true;

    updateLegacyDiagnostics({
      subscriberCount: window.NEUDDisplay._subscribers.length,
    });

    console.info("[legacy-live-ticker] subscribed");

    if (typeof window.NEUDDisplay.signalReady === "function") {
      window.NEUDDisplay.signalReady();
    } else {
      signalDisplayReady();
    }

    return true;
  }

  function isInsideNeudRuntime() {
    return Boolean(
      window.__NEUD_DISPLAY_RUNTIME_LOADED__ ||
        (window.__NEUD_DISPLAY_CONFIG__ &&
          typeof window.__NEUD_DISPLAY_CONFIG__.dataUrl === "string"),
    );
  }

  function startOptionalLegacyFallback() {
    if (isInsideNeudRuntime() || !ENDPOINT || hasReceivedNeudData) {
      return;
    }

    poll();

    fallbackPollTimer = setInterval(function legacyFallbackPoll() {
      if (hasReceivedNeudData) {
        stopFallbackPolling();
        return;
      }

      poll();
    }, POLL);
  }

  initDiagnostics();
  signalDisplayReady();

  const subscribedImmediately = subscribeToNeudRuntime();

  if (!subscribedImmediately) {
    let attempts = 0;

    const runtimeWaitTimer = setInterval(function waitForRuntime() {
      attempts += 1;

      if (subscribeToNeudRuntime()) {
        clearInterval(runtimeWaitTimer);
        return;
      }

      if (attempts >= 100) {
        clearInterval(runtimeWaitTimer);
        console.error("[NEUD Legacy Ticker] Adapter dependencies unavailable", {
          runtimeReady: Boolean(
            window.NEUDDisplay &&
              typeof window.NEUDDisplay.subscribe === "function",
          ),
          tickerReady: typeof window.placeNextLots === "function",
        });
        if (!isInsideNeudRuntime()) {
          startOptionalLegacyFallback();
        }
      }
    }, 50);
  }

  setTimeout(function beginFallbackIfNecessary() {
    if (!hasReceivedNeudData && !isInsideNeudRuntime()) {
      startOptionalLegacyFallback();
    }
  }, 2500);
})();
