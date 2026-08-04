(function () {
  "use strict";

  var NEUD_DISPLAY_SOURCE = "neud-display";
  var NEUD_RUNTIME_SOURCE = "neud-runtime";
  var NEUD_DATA_UPDATE = "NEUD_DATA_UPDATE";
  var NEUD_DISPLAY_READY = "NEUD_DISPLAY_READY";

  function normalizeNeudPayload(message) {
    if (!message || typeof message !== "object") {
      return null;
    }

    if (
      message.source === NEUD_RUNTIME_SOURCE &&
      message.type === NEUD_DATA_UPDATE &&
      message.payload &&
      typeof message.payload === "object"
    ) {
      return message.payload;
    }

    if (message.type === NEUD_DATA_UPDATE && message.payload) {
      return message.payload;
    }

    if (message.snapshot && typeof message.snapshot === "object") {
      return message.snapshot;
    }

    if (message.current || message.next || message.lots || message.dataSource) {
      return message;
    }

    return null;
  }

  function renderFromCanonical(canonical) {
    if (typeof normalize !== "function" || typeof placeNextLots !== "function") {
      return;
    }

    var view = normalize(canonical);
    placeNextLots(view.next);

    if (typeof statusEl !== "undefined" && statusEl) {
      statusEl.textContent = "";
    }
  }

  function handleNeudData(data) {
    var canonical = normalizeNeudPayload(data) || data;
    if (!canonical) {
      return;
    }
    renderFromCanonical(canonical);
  }

  function isAllowedMessageOrigin(origin) {
    if (!origin || origin === "null") {
      return true;
    }
    if (origin === window.location.origin) {
      return true;
    }
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) {
      return true;
    }
    return false;
  }

  window.addEventListener("message", function (event) {
    if (!isAllowedMessageOrigin(event.origin)) {
      return;
    }
    var data = normalizeNeudPayload(event.data);
    if (data) {
      handleNeudData(data);
    }
  });

  window.addEventListener("neud:data", function (event) {
    if (event.detail) {
      handleNeudData(event.detail);
    }
  });

  if (window.NEUDDisplay && typeof window.NEUDDisplay.subscribe === "function") {
    var existing = window.NEUDDisplay.getSnapshot();
    if (existing) {
      handleNeudData(existing);
    }
    window.NEUDDisplay.subscribe(handleNeudData);
  }

  try {
    window.postMessage(
      { source: NEUD_DISPLAY_SOURCE, type: NEUD_DISPLAY_READY },
      window.location.origin,
    );
  } catch (_) {}

  if (window.NEUDDisplay && typeof window.NEUDDisplay.signalReady === "function") {
    window.NEUDDisplay.signalReady();
  }
})();
