(function () {
  "use strict";

  var NEUD_DISPLAY_SOURCE = "neud-display";
  var NEUD_RUNTIME_SOURCE = "neud-runtime";
  var NEUD_DATA_UPDATE = "NEUD_DATA_UPDATE";
  var NEUD_DISPLAY_READY = "NEUD_DISPLAY_READY";
  var ADAPTER_NAME = "lot-photos-v1-bridge";
  var lastSignature = null;

  function textValue(value) {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return "";
  }

  function isLocalOnlyPhotoUrl(url) {
    if (!url) return false;
    if (/^file:/i.test(url) || /^[a-zA-Z]:\\|^\\\\/.test(url)) return true;
    if (/^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost)(?::\d+)?/i.test(url)) return true;
    if (url.indexOf("/api/offline-assets/") >= 0) return true;
    if (/^photos\//i.test(url) || /^images\//i.test(url)) return true;
    return false;
  }

  function isHostedAccessiblePhotoUrl(url) {
    if (!url) return false;
    if (!/^https:\/\//i.test(url)) return false;
    return !isLocalOnlyPhotoUrl(url);
  }

  function isHostedDisplayMode() {
    return window.__NEUD_DISPLAY_DATA_DISCONNECTED__ === true;
  }

  function resolveHostedPhotoUrls(photos) {
    if (!Array.isArray(photos)) return [];
    var ordered = [];
    var seen = {};
    for (var i = 0; i < photos.length; i += 1) {
      var entry = photos[i];
      var url = null;
      if (typeof entry === "string") {
        if (isHostedAccessiblePhotoUrl(entry)) url = entry;
      } else if (entry && typeof entry === "object") {
        url =
          (entry.cloudAssetUrl && isHostedAccessiblePhotoUrl(entry.cloudAssetUrl)
            ? entry.cloudAssetUrl
            : null) ||
          (entry.remoteUrl && isHostedAccessiblePhotoUrl(entry.remoteUrl)
            ? entry.remoteUrl
            : null) ||
          (entry.originalUrl && isHostedAccessiblePhotoUrl(entry.originalUrl)
            ? entry.originalUrl
            : null);
      }
      url = textValue(url);
      if (!url || seen[url]) continue;
      seen[url] = true;
      ordered.push(url);
    }
    return ordered;
  }

  function resolveLocalPhotoUrls(photos) {
    if (!Array.isArray(photos)) return [];
    var ordered = [];
    var seen = {};
    for (var i = 0; i < photos.length; i += 1) {
      var entry = photos[i];
      var url = null;
      if (typeof entry === "string") {
        url = entry;
      } else if (entry && typeof entry === "object") {
        url =
          entry.localUrl ||
          entry.displayUrl ||
          entry.remoteUrl ||
          entry.originalUrl ||
          null;
      }
      url = textValue(url);
      if (!url || seen[url]) continue;
      seen[url] = true;
      ordered.push(url);
    }
    return ordered;
  }

  function resolveDisplayPhotoUrls(photos) {
    return isHostedDisplayMode() ? resolveHostedPhotoUrls(photos) : resolveLocalPhotoUrls(photos);
  }

  function buildLotPhotosView(canonical) {
    if (!canonical || typeof canonical !== "object") {
      return { photos: [] };
    }

    var ad =
      canonical.auctionDisplay && typeof canonical.auctionDisplay === "object"
        ? canonical.auctionDisplay
        : {};
    var current =
      canonical.current && typeof canonical.current === "object" ? canonical.current : {};
    var broadArrow =
      canonical.broadArrowDisplay &&
      canonical.broadArrowDisplay.pylon &&
      typeof canonical.broadArrowDisplay.pylon === "object"
        ? canonical.broadArrowDisplay.pylon
        : null;
    var source = broadArrow || ad;

    var rawPhotos = Array.isArray(source.photos)
      ? source.photos
      : Array.isArray(ad.photos)
        ? ad.photos
        : Array.isArray(current.photos)
          ? current.photos
          : [];

    return { photos: resolveDisplayPhotoUrls(rawPhotos) };
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

  function photoSignature(photos) {
    return Array.isArray(photos) ? photos.join("|") : "";
  }

  function handleNeudData(canonical) {
    var view = buildLotPhotosView(canonical);
    var signature = photoSignature(view.photos);
    if (signature === lastSignature) {
      return;
    }
    lastSignature = signature;
    if (typeof window.render === "function") {
      window.render({ auctionDisplay: view });
    }
  }

  function isAllowedMessageOrigin(origin, event) {
    if (!origin || origin === "null") return true;
    try {
      if (origin === window.location.origin) return true;
    } catch (_) {}
    try {
      if (event && event.source === window) return true;
    } catch (_) {}
    return false;
  }

  window.addEventListener("message", function (event) {
    if (!isAllowedMessageOrigin(event.origin, event)) {
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
    window.parent.postMessage(
      { source: NEUD_DISPLAY_SOURCE, type: NEUD_DISPLAY_READY },
      "*",
    );
  } catch (_) {}

  if (window.NEUDDisplay && typeof window.NEUDDisplay.signalReady === "function") {
    window.NEUDDisplay.signalReady();
  }

  window.__NEUD_LOT_PHOTOS_ADAPTER__ = ADAPTER_NAME;
})();
