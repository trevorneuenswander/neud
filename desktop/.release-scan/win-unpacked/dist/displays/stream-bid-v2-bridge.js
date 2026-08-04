(function () {
  "use strict";

  var NEUD_DISPLAY_SOURCE = "neud-display";
  var NEUD_RUNTIME_SOURCE = "neud-runtime";
  var NEUD_DATA_UPDATE = "NEUD_DATA_UPDATE";
  var NEUD_DISPLAY_READY = "NEUD_DISPLAY_READY";

  function textValue(value) {
    if (value == null) return null;
    var text = String(value).trim();
    return text ? text : null;
  }

  function formatLotLabel(lot) {
    var value = textValue(lot);
    if (!value) return "Lot —";
    if (/^lot\b/i.test(value)) return value;
    return "Lot " + value;
  }

  function buildAuctionDisplayView(canonical) {
    if (!canonical || typeof canonical !== "object") {
      return {};
    }

    var ad =
      canonical.auctionDisplay && typeof canonical.auctionDisplay === "object"
        ? canonical.auctionDisplay
        : {};
    var current =
      canonical.current && typeof canonical.current === "object"
        ? canonical.current
        : {};
    var broadArrow =
      canonical.broadArrowDisplay &&
      canonical.broadArrowDisplay.pylon &&
      typeof canonical.broadArrowDisplay.pylon === "object"
        ? canonical.broadArrowDisplay.pylon
        : null;

    var source = broadArrow || ad;

    var photos = Array.isArray(source.photos)
      ? source.photos
      : Array.isArray(ad.photos)
        ? ad.photos
        : Array.isArray(current.photos)
          ? current.photos
          : [];

    return {
      lot: textValue(source.lot) || formatLotLabel(current.lot),
      title: textValue(source.title) || textValue(current.title) || "",
      year: textValue(source.year) || textValue(current.year) || null,
      biddingPrice:
        textValue(source.biddingPrice) ||
        textValue(ad.biddingPrice) ||
        textValue(current.price) ||
        textValue(current.biddingPrice) ||
        null,
      reserveStatus:
        textValue(source.reserveStatus) ||
        textValue(ad.reserveStatus) ||
        textValue(current.status) ||
        null,
      currencies: Array.isArray(source.currencies)
        ? source.currencies.filter(function (entry) {
            return typeof entry === "string";
          })
        : Array.isArray(ad.currencies)
          ? ad.currencies.filter(function (entry) {
              return typeof entry === "string";
            })
          : [],
      photos: photos.filter(Boolean),
    };
  }

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

    if (message.current || message.auctionDisplay || message.broadArrowDisplay) {
      return message;
    }

    return null;
  }

  function renderFromCanonical(canonical) {
    if (typeof render !== "function") {
      return;
    }
    render({ auctionDisplay: buildAuctionDisplayView(canonical) });
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
