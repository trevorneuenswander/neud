(function () {
  "use strict";

  var NEUD_DISPLAY_SOURCE = "neud-display";
  var NEUD_RUNTIME_SOURCE = "neud-runtime";
  var NEUD_DATA_UPDATE = "NEUD_DATA_UPDATE";
  var NEUD_RENDER_STATUS = "NEUD_RENDER_STATUS";
  var NEUD_DISPLAY_READY = "NEUD_DISPLAY_READY";
  var NEUD_HOSTED_BRIDGE_STATUS = "NEUD_HOSTED_BRIDGE_STATUS";
  var ADAPTER_NAME = "stream-bid-v2-bridge";
  var lastCanonicalViewSignature = null;
  var hostedPhotoGeneration = 0;
  var hostedPhotoCache = Object.create(null);
  var hostedPendingRenderToken = 0;

  function preloadHostedImage(url) {
    if (!url) {
      return Promise.resolve({ ok: false, cached: false });
    }
    if (hostedPhotoCache[url]) {
      return Promise.resolve({ ok: true, cached: true });
    }
    if (typeof Image !== "function") {
      return Promise.resolve({ ok: false, cached: false });
    }
    return new Promise(function (resolve) {
      var image = new Image();
      image.onload = function () {
        hostedPhotoCache[url] = true;
        resolve({ ok: true, cached: false });
      };
      image.onerror = function () {
        resolve({ ok: false, cached: false });
      };
      image.src = url;
    });
  }

  function preloadHostedLotPhotos(photos, generation) {
    var list = resolveHostedPhotoUrls(Array.isArray(photos) ? photos : []);

    if (!list.length) {
      return Promise.resolve({
        generation: generation,
        firstLoaded: true,
        cacheHits: 0,
        failedCount: 0,
        remainingCount: 0,
      });
    }

    notifyHostedAdapterStatus({
      hostedPhotoGeneration: generation,
      incomingPhotoCount: list.length,
      firstImageRequestStarted: true,
      remainingPreloadCount: Math.max(0, list.length - 1),
    });

    return preloadHostedImage(list[0]).then(function (firstResult) {
      if (generation !== hostedPhotoGeneration) {
        return {
          generation: generation,
          firstLoaded: false,
          cacheHits: 0,
          failedCount: 0,
          remainingCount: 0,
          stale: true,
        };
      }

      var cacheHits = firstResult.cached ? 1 : 0;
      var failedCount = firstResult.ok ? 0 : 1;

      if (list.length > 1) {
        void Promise.all(
          list.slice(1).map(function (url) {
            return preloadHostedImage(url).then(function (result) {
              if (generation !== hostedPhotoGeneration) {
                return;
              }
              if (result.cached) {
                cacheHits += 1;
              }
              if (!result.ok) {
                failedCount += 1;
              }
            });
          }),
        ).then(function () {
          if (generation !== hostedPhotoGeneration) {
            return;
          }
          notifyHostedAdapterStatus({
            hostedPhotoGeneration: generation,
            remainingPreloadCount: 0,
            failedImageCount: failedCount,
            cacheHitCount: cacheHits,
          });
        });
      }

      return {
        generation: generation,
        firstLoaded: firstResult.ok,
        cacheHits: cacheHits,
        failedCount: failedCount,
        remainingCount: Math.max(0, list.length - 1),
        stale: false,
      };
    });
  }

  function hashPhotoListSignature(photos) {
    if (!Array.isArray(photos)) {
      return "0";
    }
    var filtered = [];
    for (var i = 0; i < photos.length; i += 1) {
      var value = textValue(photos[i]);
      if (value) {
        filtered.push(value);
      }
    }
    return String(filtered.length) + ":" + filtered.join("\0");
  }

  function logCanonicalGroupTransition(canonical, view) {
    if (!isPreviewDiagnosticsEnabled()) {
      return;
    }

    var lotGroup = textValue(view.lot) || "";
    var titleGroup = textValue(view.title) || "";
    var bidGroup = textValue(view.biddingPrice) || "";
    var photoList = Array.isArray(view.photos) ? view.photos : [];
    var photoSig = hashPhotoListSignature(photoList);
    var revision =
      canonical && typeof canonical === "object"
        ? canonical.revision ?? canonical.canonicalRevision ?? null
        : null;
    var payloadHashPrefix =
      canonical && typeof canonical === "object" && typeof canonical.payloadHash === "string"
        ? canonical.payloadHash.slice(0, 12)
        : null;

    var previous = lastCanonicalViewSignature;
    if (previous) {
      logStreamBidDisplay("canonical_groups", {
        currentLotGroupChanged: previous.lotGroup !== lotGroup,
        titleGroupChanged: previous.titleGroup !== titleGroup,
        bidGroupChanged: previous.bidGroup !== bidGroup,
        photoListGroupChanged:
          previous.photoSig !== photoSig || previous.photoCount !== photoList.length,
        oldPhotoCount: previous.photoCount,
        newPhotoCount: photoList.length,
        canonicalRevision: revision,
        payloadHashPrefix: payloadHashPrefix,
      });
    }

    lastCanonicalViewSignature = {
      lotGroup: lotGroup,
      titleGroup: titleGroup,
      bidGroup: bidGroup,
      photoCount: photoList.length,
      photoSig: photoSig,
    };
  }

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

  function resolveHostedPhotoUrls(photos) {
    if (!Array.isArray(photos)) return [];
    var ordered = [];
    var seen = {};
    var rejectedLocalOnlyCount = 0;

    for (var i = 0; i < photos.length; i += 1) {
      var entry = photos[i];
      var url = null;
      if (typeof entry === "string") {
        if (isHostedAccessiblePhotoUrl(entry)) {
          url = entry;
        } else if (isLocalOnlyPhotoUrl(entry)) {
          rejectedLocalOnlyCount += 1;
        }
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
        if (!url && entry.storageObjectId) {
          rejectedLocalOnlyCount += 1;
        }
        if (!url && entry.localUrl && isLocalOnlyPhotoUrl(entry.localUrl)) {
          rejectedLocalOnlyCount += 1;
        }
      }
      if (!url || seen[url]) continue;
      seen[url] = true;
      ordered.push(url);
    }

    notifyHostedAdapterStatus({
      hostedSelectedRemoteCount: ordered.length,
      rejectedLocalOnlyUrlCount: rejectedLocalOnlyCount,
    });

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

    var rawPhotos = Array.isArray(source.photos)
      ? source.photos
      : Array.isArray(ad.photos)
        ? ad.photos
        : Array.isArray(current.photos)
          ? current.photos
          : [];
    var photos = resolveDisplayPhotoUrls(rawPhotos);

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
      photos: photos,
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

  function isHostedDisplayMode() {
    return window.__NEUD_DISPLAY_DATA_DISCONNECTED__ === true;
  }

  function isHostedBridgeDebugEnabled() {
    if (!isHostedDisplayMode()) {
      return false;
    }
    if (window.__NEUD_HOSTED_BRIDGE__ && typeof window.__NEUD_HOSTED_BRIDGE__.isDebugEnabled === "function") {
      return window.__NEUD_HOSTED_BRIDGE__.isDebugEnabled();
    }
    try {
      return new URLSearchParams(window.location.search).get("neudDebug") === "1";
    } catch (_) {
      return false;
    }
  }

  function notifyHostedRenderStatus(status) {
    if (!isHostedDisplayMode()) {
      return;
    }
    var displayInfo =
      window.NEUDDisplay && typeof window.NEUDDisplay.getDisplayInfo === "function"
        ? window.NEUDDisplay.getDisplayInfo()
        : null;
    try {
      window.parent.postMessage(
        Object.assign(
          {
            source: NEUD_RUNTIME_SOURCE,
            type: NEUD_RENDER_STATUS,
            version: 1,
            revision:
              displayInfo && displayInfo.revision != null ? displayInfo.revision : null,
            adapter: ADAPTER_NAME,
          },
          status,
        ),
        "*",
      );
    } catch (_) {}
  }

  function notifyHostedAdapterStatus(status) {
    if (!isHostedDisplayMode()) {
      return;
    }
    if (window.__NEUD_HOSTED_BRIDGE__ && typeof window.__NEUD_HOSTED_BRIDGE__.notifyStatus === "function") {
      window.__NEUD_HOSTED_BRIDGE__.notifyStatus(
        Object.assign({ adapterSelected: ADAPTER_NAME }, status),
      );
      return;
    }
    try {
      window.parent.postMessage(
        Object.assign(
          { source: NEUD_DISPLAY_SOURCE, type: NEUD_HOSTED_BRIDGE_STATUS, adapterSelected: ADAPTER_NAME },
          status,
        ),
        "*",
      );
    } catch (_) {}
  }

  function describeCanonicalShape(canonical) {
    if (!canonical || typeof canonical !== "object") {
      return {
        keyPresence: [],
        currentLotPresent: false,
        currentBidPresent: false,
        imageCount: 0,
      };
    }

    var view = buildAuctionDisplayView(canonical);
    return {
      keyPresence: Object.keys(canonical),
      currentLotPresent: Boolean(textValue(canonical.current && canonical.current.lot) || view.lot),
      currentBidPresent: Boolean(
        textValue(canonical.current && canonical.current.price) ||
          textValue(canonical.current && canonical.current.biddingPrice) ||
          view.biddingPrice,
      ),
      imageCount: Array.isArray(view.photos) ? view.photos.length : 0,
    };
  }

  function isPreviewDiagnosticsEnabled() {
    if (isHostedBridgeDebugEnabled()) {
      return true;
    }
    try {
      return new URLSearchParams(window.location.search).get("neudDebug") === "1";
    } catch (_) {
      return false;
    }
  }

  function logStreamBidDisplay(stage, info) {
    if (!isPreviewDiagnosticsEnabled()) {
      return;
    }
    console.debug("[StreamBidDisplay] " + stage, info || {});
  }

  function resolveCanonicalInput(data) {
    if (typeof resolveDisplayRuntimeSnapshot === "function") {
      var resolved = resolveDisplayRuntimeSnapshot(data);
      if (resolved) {
        return resolved;
      }
    }
    return normalizeNeudPayload(data) || (data && typeof data === "object" ? data : null);
  }

  function renderFromCanonical(canonical, callbacks) {
    if (typeof render !== "function") {
      logStreamBidDisplay("render_skipped", { skipReason: "render_function_missing" });
      notifyHostedAdapterStatus({
        renderUpdateCompleted: false,
        renderErrorCategory: "render_function_missing",
        renderSkippedReason: "render_function_missing",
      });
      return false;
    }

    var view = buildAuctionDisplayView(canonical);
    logStreamBidDisplay("view_built", {
      inputTopLevelKeys: Object.keys(view),
      resolvedCurrentLot: Boolean(textValue(view.lot)),
      resolvedLotNumber: Boolean(textValue(view.lot)),
      resolvedTitle: Boolean(textValue(view.title)),
      resolvedBid: Boolean(textValue(view.biddingPrice)),
      resolvedCurrenciesCount: Array.isArray(view.currencies) ? view.currencies.length : 0,
      resolvedPhotoCount: Array.isArray(view.photos) ? view.photos.length : 0,
    });
    logStreamBidDisplay("render_started", {
      resolvedPhotoCount: Array.isArray(view.photos) ? view.photos.length : 0,
    });

    function commitRender() {
      render({ auctionDisplay: view });
      if (callbacks && typeof callbacks.onRendered === "function") {
        callbacks.onRendered(view);
      }
    }

    if (!isHostedDisplayMode()) {
      commitRender();
      return true;
    }

    hostedPhotoGeneration += 1;
    var generation = hostedPhotoGeneration;
    var renderToken = ++hostedPendingRenderToken;

    preloadHostedLotPhotos(view.photos, generation).then(function (result) {
      if (renderToken !== hostedPendingRenderToken || result.stale) {
        return;
      }

      notifyHostedAdapterStatus({
        hostedPhotoGeneration: generation,
        firstImageLoaded: result.firstLoaded,
        remainingPreloadCount: result.remainingCount,
        failedImageCount: result.failedCount,
        cacheHitCount: result.cacheHits,
        visiblePhotoGeneration: generation,
      });

      commitRender();
    });

    return true;
  }

  function handleNeudData(data) {
    var canonical = resolveCanonicalInput(data);
    if (!canonical) {
      logStreamBidDisplay("render_skipped", { skipReason: "empty_payload" });
      notifyHostedAdapterStatus({
        renderUpdateCompleted: false,
        renderErrorCategory: "empty_payload",
        streamBidInputReceived: false,
        renderSkippedReason: "empty_payload",
      });
      notifyHostedRenderStatus({
        inputReceived: false,
        currentLotResolved: false,
        bidResolved: false,
        photoCount: 0,
        renderCompleted: false,
        skipReason: "empty_payload",
      });
      return;
    }

    var shape = describeCanonicalShape(canonical);
    logStreamBidDisplay("input_received", {
      inputTopLevelKeys: shape.keyPresence,
      resolvedCurrentLot: shape.currentLotPresent,
      resolvedLotNumber: shape.currentLotPresent,
      resolvedTitle: Boolean(textValue(buildAuctionDisplayView(canonical).title)),
      resolvedBid: shape.currentBidPresent,
      resolvedCurrenciesCount: Array.isArray(buildAuctionDisplayView(canonical).currencies)
        ? buildAuctionDisplayView(canonical).currencies.length
        : 0,
      resolvedPhotoCount: shape.imageCount,
    });

    var view = buildAuctionDisplayView(canonical);
    logCanonicalGroupTransition(canonical, view);
    var missingRequiredFields = [];
    if (!textValue(view.lot)) {
      missingRequiredFields.push("lot");
    }
    if (!textValue(view.title)) {
      missingRequiredFields.push("title");
    }
    if (!textValue(view.biddingPrice)) {
      missingRequiredFields.push("biddingPrice");
    }

    var skipReason = missingRequiredFields.length > 0 ? "missing_fields" : null;

    var rendered = renderFromCanonical(canonical, {
      onRendered: function (renderedView) {
        logStreamBidDisplay("render_completed", {
          resolvedCurrentLot: Boolean(textValue(renderedView.lot)),
          resolvedBid: Boolean(textValue(renderedView.biddingPrice)),
          resolvedPhotoCount: Array.isArray(renderedView.photos) ? renderedView.photos.length : 0,
          skipReason: skipReason,
        });
        notifyHostedAdapterStatus({
          adapterInputShapeKeys: shape.keyPresence,
          renderUpdateCompleted: true,
          renderErrorCategory: null,
          missingRequiredFields: missingRequiredFields,
          lastSubscriberInvocationAt: new Date().toISOString(),
          streamBidInputReceived: true,
          currentLotResolved: Boolean(textValue(renderedView.lot)),
          bidResolved: Boolean(textValue(renderedView.biddingPrice)),
          photosResolvedCount: Array.isArray(renderedView.photos) ? renderedView.photos.length : 0,
          renderSkippedReason: skipReason,
        });
        notifyHostedRenderStatus({
          inputReceived: true,
          currentLotResolved: Boolean(textValue(renderedView.lot)),
          bidResolved: Boolean(textValue(renderedView.biddingPrice)),
          photoCount: Array.isArray(renderedView.photos) ? renderedView.photos.length : 0,
          renderCompleted: true,
          skipReason: skipReason,
        });
      },
    });

    if (!rendered) {
      logStreamBidDisplay("render_skipped", { skipReason: "render_failed" });
      notifyHostedRenderStatus({
        inputReceived: true,
        currentLotResolved: Boolean(textValue(view.lot)),
        bidResolved: Boolean(textValue(view.biddingPrice)),
        photoCount: Array.isArray(view.photos) ? view.photos.length : 0,
        renderCompleted: false,
        skipReason: "render_failed",
      });
      return;
    }

    if (!isHostedDisplayMode()) {
      logStreamBidDisplay("render_completed", {
        resolvedCurrentLot: Boolean(textValue(view.lot)),
        resolvedBid: Boolean(textValue(view.biddingPrice)),
        resolvedPhotoCount: Array.isArray(view.photos) ? view.photos.length : 0,
        skipReason: skipReason,
      });
      notifyHostedAdapterStatus({
        adapterInputShapeKeys: shape.keyPresence,
        renderUpdateCompleted: true,
        renderErrorCategory: null,
        missingRequiredFields: missingRequiredFields,
        lastSubscriberInvocationAt: new Date().toISOString(),
        streamBidInputReceived: true,
        currentLotResolved: Boolean(textValue(view.lot)),
        bidResolved: Boolean(textValue(view.biddingPrice)),
        photosResolvedCount: Array.isArray(view.photos) ? view.photos.length : 0,
        renderSkippedReason: skipReason,
      });
      notifyHostedRenderStatus({
        inputReceived: true,
        currentLotResolved: Boolean(textValue(view.lot)),
        bidResolved: Boolean(textValue(view.biddingPrice)),
        photoCount: Array.isArray(view.photos) ? view.photos.length : 0,
        renderCompleted: true,
        skipReason: skipReason,
      });
    }
  }

  function isAllowedMessageOrigin(origin, event) {
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
        if (event && event.source === window.parent) {
          return true;
        }
      } catch (_) {}
    }
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
    notifyHostedRenderStatus({
      inputReceived: Boolean(existing),
      currentLotResolved: false,
      bidResolved: false,
      photoCount: 0,
      renderCompleted: false,
      skipReason: existing ? null : "awaiting_data",
      subscriptionRegistered: true,
    });
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
})();
