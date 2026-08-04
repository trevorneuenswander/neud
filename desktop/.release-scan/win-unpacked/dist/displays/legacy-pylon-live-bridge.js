window.__NEUD_PYLON_REVISION__ = "legacy-pylon-live-v1-2026-07-26";

/* ===== NEUD Legacy Pylon live-data bridge ===== */

(function initializeNeudPylonBridge() {
  "use strict";

  if (window.__NEUD_LEGACY_PYLON_ADAPTER_INSTALLED__) {
    return;
  }

  let diagnosticsInitialized = false;

  function initDiagnostics() {
    if (diagnosticsInitialized) {
      return;
    }
    diagnosticsInitialized = true;

    console.info("[legacy-live-pylon] init", {
      revision: window.__NEUD_PYLON_REVISION__,
      href: window.location.href,
      hasNEUDDisplay: Boolean(window.NEUDDisplay),
      hasRender: typeof window.render === "function",
      isIframe: window.parent !== window,
    });
  }

  function textValue(value) {
    if (value == null) return "";
    var text = String(value).trim();
    return text;
  }

  function formatLotLabel(lot) {
    var value = textValue(lot);
    if (!value) return "Lot —";
    if (/^lot\b/i.test(value)) return value;
    return "Lot " + value;
  }

  function normalizeReserveStatusForPylon(value) {
    var text = textValue(value);
    if (!text) return "";
    if (
      /offered\s+without\s+reserve|offered_without_reserve|no[-_]?reserve|without\s+reserve/i.test(
        text,
      )
    ) {
      return "Offered Without Reserve";
    }
    return "";
  }

  function isUsablePhotoUrl(url) {
    if (!url || typeof url !== "string") return false;
    var trimmed = url.trim();
    if (!trimmed) return false;
    if (/logo|icon|avatar|badge|spinner|placeholder|favicon|1x1|pixel|no-image|noimage|missing|pip/i.test(trimmed)) {
      return false;
    }
    if (/no[-_]?photo|default[-_]?image|coming[-_]?soon/i.test(trimmed)) {
      return false;
    }
    return /^https?:\/\//i.test(trimmed) || trimmed.indexOf("/api/offline-assets/") === 0;
  }

  function filterPhotos(photos) {
    var ordered = [];
    var seen = {};
    if (!Array.isArray(photos)) return ordered;
    for (var i = 0; i < photos.length; i += 1) {
      var url = textValue(photos[i]);
      if (!url) continue;
      url = url.replace(/\/\/[^/@]+@[^/]+\//g, "//");
      if (!isUsablePhotoUrl(url) || seen[url]) continue;
      seen[url] = true;
      ordered.push(url);
    }
    return ordered;
  }

  function filterCurrencies(currencies) {
    if (!Array.isArray(currencies)) return [];
    return currencies
      .map(function (entry) {
        return textValue(entry);
      })
      .filter(function (entry) {
        return entry && /\d/.test(entry);
      })
      .slice(0, 4);
  }

  function normalizeTitleAndYear(title, year) {
    var titleText = textValue(title);
    var yearText = textValue(year);
    if (!titleText) {
      return { title: "", year: yearText };
    }
    if (yearText && titleText.indexOf(yearText) === 0) {
      return { title: titleText.replace(new RegExp("^" + yearText + "\\s*"), "").trim() || titleText, year: yearText };
    }
    return { title: titleText, year: yearText };
  }

  function buildAuctionDisplayView(source) {
    if (!source || typeof source !== "object") {
      return {
        lot: "Lot —",
        title: "",
        year: "",
        reserveStatus: "",
        biddingPrice: "",
        currencies: [],
        photos: [],
      };
    }

    var titleYear = normalizeTitleAndYear(source.title, source.year);

    return {
      lot: formatLotLabel(source.lot),
      title: titleYear.title,
      year: titleYear.year,
      reserveStatus: normalizeReserveStatusForPylon(source.reserveStatus),
      biddingPrice: normalizeDisplayBidValue(source.biddingPrice),
      currencies: hasDisplayBid(source.biddingPrice)
        ? filterCurrencies(source.currencies)
        : [],
      photos: filterPhotos(source.photos),
    };
  }

  function normalizeDisplayBidValue(value) {
    var numeric = parseDisplayBidAmount(value);
    if (numeric == null) {
      return "—";
    }
    return "$ " + numeric.toLocaleString("en-US");
  }

  function parseDisplayBidAmount(value) {
    if (value == null) return null;
    if (typeof value === "number") {
      return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
    }
    var trimmed = String(value).trim();
    if (!trimmed || trimmed === "—" || trimmed === "-") return null;
    if (/^\$?\s*0(?:\.00)?$/i.test(trimmed)) return null;
    if (/no\s*bid/i.test(trimmed)) return null;
    if (/nan/i.test(trimmed)) return null;
    var digitsOnly = trimmed.replace(/[$€£¥,\s]/g, "");
    if (!digitsOnly || !/^\d+(\.\d+)?$/.test(digitsOnly)) return null;
    var amount = Number(digitsOnly);
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
  }

  function hasDisplayBid(value) {
    return parseDisplayBidAmount(value) != null;
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

  function resolvePylonSource(payload) {
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

    var snapshot =
      payload.snapshot && typeof payload.snapshot === "object"
        ? payload.snapshot
        : payload;

    if (
      snapshot.auctionDisplay &&
      typeof snapshot.auctionDisplay === "object"
    ) {
      return snapshot.auctionDisplay;
    }

    var current =
      snapshot.current && typeof snapshot.current === "object"
        ? snapshot.current
        : null;

    if (current) {
      return {
        lot: current.lot,
        title: current.title,
        year: current.year,
        reserveStatus: current.reserveStatus || current.status,
        biddingPrice: current.biddingPrice || current.price,
        currencies: current.currencies,
        photos: current.photos,
      };
    }

    return null;
  }

  function renderNeudPylonData(rawMessage) {
    var payload = unwrapNeudMessage(rawMessage);
    var source = resolvePylonSource(payload);

    console.info("[legacy-live-pylon] update", {
      topLevelKeys: Object.keys(payload || {}),
      hasBroadArrowPylon: Boolean(payload && payload.broadArrowDisplay && payload.broadArrowDisplay.pylon),
      sourceKeys: source ? Object.keys(source) : null,
    });

    if (!source || typeof window.render !== "function") {
      return;
    }

    var auctionDisplay = buildAuctionDisplayView(source);

    window.render({ auctionDisplay: auctionDisplay });

    if (typeof statusEl !== "undefined" && statusEl) {
      statusEl.textContent = "";
    }

    console.info("[legacy-live-pylon] rendered", {
      lot: auctionDisplay.lot,
      title: auctionDisplay.title,
      bid: auctionDisplay.biddingPrice,
      photos: auctionDisplay.photos.length,
    });
  }

  function signalDisplayReady() {
    var readyMessage = {
      source: "neud-display",
      type: "NEUD_DISPLAY_READY",
    };

    try {
      window.postMessage(readyMessage, window.location.origin);
    } catch (error) {
      console.warn("[legacy-live-pylon] window ready signal failed:", error);
    }

    if (window.parent !== window) {
      try {
        window.parent.postMessage(readyMessage, window.location.origin);
      } catch (error) {
        console.warn("[legacy-live-pylon] parent ready signal failed:", error);
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

    if (typeof window.render !== "function") {
      return false;
    }

    if (typeof window.NEUDDisplay.getSnapshot === "function") {
      var existingSnapshot = window.NEUDDisplay.getSnapshot();
      if (existingSnapshot) {
        renderNeudPylonData(existingSnapshot);
      }
    }

    window.__NEUD_LEGACY_PYLON_ADAPTER_UNSUBSCRIBE__ =
      window.NEUDDisplay.subscribe(function onNeudSnapshot(snapshot) {
        renderNeudPylonData(snapshot);
      });

    window.__NEUD_LEGACY_PYLON_ADAPTER_INSTALLED__ = true;

    console.info("[legacy-live-pylon] subscribed");

    if (typeof window.NEUDDisplay.signalReady === "function") {
      window.NEUDDisplay.signalReady();
    } else {
      signalDisplayReady();
    }

    return true;
  }

  window.addEventListener("message", function onNeudMessage(event) {
    var message = event.data;
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "NEUD_DATA_UPDATE" || message.source === "neud-runtime") {
      renderNeudPylonData(message);
    }
  });

  window.addEventListener("neud:data", function onNeudDataEvent(event) {
    if (event.detail) {
      renderNeudPylonData(event.detail);
    }
  });

  initDiagnostics();
  signalDisplayReady();

  var subscribedImmediately = subscribeToNeudRuntime();

  if (!subscribedImmediately) {
    var attempts = 0;
    var runtimeWaitTimer = setInterval(function waitForRuntime() {
      attempts += 1;

      if (subscribeToNeudRuntime()) {
        clearInterval(runtimeWaitTimer);
        return;
      }

      if (attempts >= 100) {
        clearInterval(runtimeWaitTimer);
        console.error("[NEUD Legacy Pylon] Adapter dependencies unavailable", {
          runtimeReady: Boolean(
            window.NEUDDisplay &&
              typeof window.NEUDDisplay.subscribe === "function",
          ),
          renderReady: typeof window.render === "function",
        });
      }
    }, 50);
  }
})();
