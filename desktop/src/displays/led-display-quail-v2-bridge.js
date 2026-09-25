(function initializeNeudLedDisplayQuailBridge() {
  "use strict";

  if (window.__NEUD_LED_DISPLAY_QUAIL_ADAPTER_INSTALLED__) {
    return;
  }
  window.__NEUD_LED_DISPLAY_QUAIL_ADAPTER_INSTALLED__ = true;

  var NEUD_RUNTIME_SOURCE = "neud-runtime";
  var NEUD_DATA_UPDATE = "NEUD_DATA_UPDATE";

  function textValue(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).trim();
  }

  function formatLotLabel(value) {
    var lot = textValue(value);
    if (!lot) {
      return "";
    }
    return /^lot\b/i.test(lot) ? lot.toUpperCase() : "LOT " + lot.replace(/^lot\s+/i, "");
  }

  function unwrapNeudMessage(message) {
    if (!message || typeof message !== "object") {
      return null;
    }
    if (
      message.type === NEUD_DATA_UPDATE &&
      message.payload &&
      typeof message.payload === "object"
    ) {
      return message.payload;
    }
    if (
      message.source === NEUD_RUNTIME_SOURCE &&
      message.payload &&
      typeof message.payload === "object"
    ) {
      return message.payload;
    }
    if (message.snapshot && typeof message.snapshot === "object") {
      return message.snapshot;
    }
    if (message.current || message.auctionDisplay || message.broadArrowDisplay) {
      return message;
    }
    return message;
  }

  function resolveBroadArrowPylon(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    if (
      payload.broadArrowDisplay &&
      payload.broadArrowDisplay.pylon &&
      typeof payload.broadArrowDisplay.pylon === "object"
    ) {
      return payload.broadArrowDisplay.pylon;
    }
    if (payload.auctionDisplay && typeof payload.auctionDisplay === "object") {
      return payload.auctionDisplay;
    }
    return null;
  }

  function resolveUpNextLots(payload) {
    if (!payload || typeof payload !== "object") {
      return [];
    }
    if (payload.streamTickerFeed && Array.isArray(payload.streamTickerFeed.next)) {
      return payload.streamTickerFeed.next;
    }
    if (
      payload.broadArrowDisplay &&
      payload.broadArrowDisplay.ticker &&
      Array.isArray(payload.broadArrowDisplay.ticker.next)
    ) {
      return payload.broadArrowDisplay.ticker.next;
    }
    if (Array.isArray(payload.next)) {
      return payload.next;
    }
    return [];
  }

  function resolveLocalPhotoUrls(photos) {
    if (!Array.isArray(photos)) {
      return [];
    }
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < photos.length; i += 1) {
      var entry = photos[i];
      var url =
        typeof entry === "string"
          ? entry
          : entry && typeof entry === "object"
            ? textValue(entry.url || entry.src || entry.href)
            : "";
      if (!url || seen[url]) {
        continue;
      }
      seen[url] = true;
      out.push(url);
    }
    return out;
  }

  function buildQuailDisplayView(payload) {
    var pylon = resolveBroadArrowPylon(payload);
    var current =
      payload && payload.current && typeof payload.current === "object"
        ? payload.current
        : {};
    var source = pylon || current;

    return {
      lot: textValue(source.lot) || formatLotLabel(current.lot),
      title: textValue(source.title) || textValue(current.title) || "",
      biddingPrice:
        textValue(source.biddingPrice) ||
        textValue(current.price) ||
        textValue(current.biddingPrice) ||
        "",
      reserveStatus:
        textValue(source.reserveStatus) || textValue(current.status) || "",
      currencies: Array.isArray(source.currencies)
        ? source.currencies.filter(function (entry) {
            return typeof entry === "string";
          })
        : [],
      photos: resolveLocalPhotoUrls(
        Array.isArray(source.photos)
          ? source.photos
          : Array.isArray(current.photos)
            ? current.photos
            : [],
      ),
    };
  }

  function adaptUpcomingLot(lot) {
    if (!lot || typeof lot !== "object") {
      return { lot: "", title: "" };
    }
    return {
      lot: textValue(lot.lot),
      title: textValue(lot.title),
    };
  }

  function renderQuailPayload(rawMessage) {
    var payload = unwrapNeudMessage(rawMessage);
    if (!payload) {
      return;
    }

    var view = buildQuailDisplayView(payload);
    var nextLots = resolveUpNextLots(payload)
      .map(adaptUpcomingLot)
      .filter(function (entry) {
        return entry.lot && entry.title;
      });

    if (typeof window.renderQuailFeed === "function") {
      window.renderQuailFeed({
        auctionDisplay: view,
        next: nextLots,
      });
    }
  }

  function isAllowedMessage(event) {
    if (!event) {
      return true;
    }
    var origin = event.origin;
    if (!origin || origin === "null") {
      return true;
    }
    if (origin === window.location.origin) {
      return true;
    }
    return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin);
  }

  window.addEventListener("message", function onNeudMessage(event) {
    if (!isAllowedMessage(event)) {
      return;
    }
    var message = event.data;
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === NEUD_DATA_UPDATE || message.source === NEUD_RUNTIME_SOURCE) {
      renderQuailPayload(message);
    }
  });

  window.addEventListener("neud:data", function onNeudDataEvent(event) {
    if (event.detail) {
      renderQuailPayload(event.detail);
    }
  });

  function subscribeToNeudRuntime() {
    if (
      !window.NEUDDisplay ||
      typeof window.NEUDDisplay.subscribe !== "function" ||
      typeof window.renderQuailFeed !== "function"
    ) {
      window.setTimeout(subscribeToNeudRuntime, 50);
      return;
    }
    window.NEUDDisplay.subscribe(function onRuntimeData(data) {
      renderQuailPayload(data);
    });
  }

  subscribeToNeudRuntime();
})();
