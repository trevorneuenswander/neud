window.__NEUD_STREAM_TICKER_REVISION__ = "stream-ticker-v1-2026-07-27";

(function initializeNeudStreamTickerBridge() {
  "use strict";

  if (window.__NEUD_STREAM_TICKER_ADAPTER_INSTALLED__) {
    return;
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

    if (
      payload.broadArrowDisplay &&
      payload.broadArrowDisplay.ticker &&
      Array.isArray(payload.broadArrowDisplay.ticker.next)
    ) {
      return { next: payload.broadArrowDisplay.ticker.next };
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

  function renderNeudTickerData(rawMessage) {
    var payload = unwrapNeudMessage(rawMessage);
    var tickerData = resolveBroadArrowTickerData(payload);

    if (!tickerData) {
      return;
    }

    var normalized = normalize(tickerData);
    if (!normalized || !Array.isArray(normalized.next)) {
      return;
    }

    var compatibleNext = normalized.next.slice(0, 3).map(adaptUpcomingLot);

    if (typeof placeNextLots === "function") {
      placeNextLots(compatibleNext);
    }
  }

  function isHostedDisplayMode() {
    return window.__NEUD_DISPLAY_DATA_DISCONNECTED__ === true;
  }

  function isAllowedTickerMessage(event) {
    if (!event) {
      return false;
    }
    var origin = event.origin;
    if (!origin || origin === "null") {
      return true;
    }
    if (origin === window.location.origin) {
      return true;
    }
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) {
      return true;
    }
    if (isHostedDisplayMode()) {
      try {
        if (event.source === window.parent) {
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  window.addEventListener("message", function onNeudMessage(event) {
    if (!isAllowedTickerMessage(event)) {
      return;
    }
    var message = event.data;
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

  function subscribeToNeudRuntime() {
    if (
      !window.NEUDDisplay ||
      typeof window.NEUDDisplay.subscribe !== "function" ||
      typeof window.placeNextLots !== "function"
    ) {
      return false;
    }

    if (typeof window.NEUDDisplay.getSnapshot === "function") {
      var existingSnapshot = window.NEUDDisplay.getSnapshot();
      if (existingSnapshot) {
        renderNeudTickerData(existingSnapshot);
      }
    }

    window.NEUDDisplay.subscribe(function onNeudSnapshot(snapshot) {
      renderNeudTickerData(snapshot);
    });

    window.__NEUD_STREAM_TICKER_ADAPTER_INSTALLED__ = true;

    if (typeof window.NEUDDisplay.signalReady === "function") {
      window.NEUDDisplay.signalReady();
    } else {
      try {
        window.postMessage(
          { source: "neud-display", type: "NEUD_DISPLAY_READY" },
          window.location.origin,
        );
      } catch (_) {}
    }

    return true;
  }

  if (!subscribeToNeudRuntime()) {
    var attempts = 0;
    var runtimeWaitTimer = setInterval(function waitForRuntime() {
      attempts += 1;
      if (subscribeToNeudRuntime() || attempts >= 100) {
        clearInterval(runtimeWaitTimer);
      }
    }, 50);
  }
})();
