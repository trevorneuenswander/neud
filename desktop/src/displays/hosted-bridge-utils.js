(function () {
  "use strict";

  var NEUD_RUNTIME_SOURCE = "neud-runtime";
  var NEUD_DATA_UPDATE = "NEUD_DATA_UPDATE";

  function isHostedDisplayMode() {
    return window.__NEUD_DISPLAY_DATA_DISCONNECTED__ === true;
  }

  function isHostedBridgeDebugEnabled() {
    if (!isHostedDisplayMode()) {
      return false;
    }
    try {
      return new URLSearchParams(window.location.search).get("neudDebug") === "1";
    } catch (_) {
      return false;
    }
  }

  function isAllowedLocalMessageOrigin(origin) {
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

  function isHostedParentMessage(event) {
    if (!isHostedDisplayMode()) {
      return false;
    }
    try {
      return Boolean(event && event.source === window.parent);
    } catch (_) {
      return false;
    }
  }

  function isAllowedNeudHostedMessage(event) {
    if (!event) {
      return false;
    }
    if (isAllowedLocalMessageOrigin(event.origin)) {
      return true;
    }
    return isHostedParentMessage(event);
  }

  function unwrapNeudDataUpdateMessage(data) {
    if (!data || typeof data !== "object") {
      return null;
    }

    if (
      data.source === NEUD_RUNTIME_SOURCE &&
      data.type === NEUD_DATA_UPDATE &&
      data.payload &&
      typeof data.payload === "object"
    ) {
      return {
        snapshot: data.payload,
        revision: data.revision != null ? data.revision : null,
      };
    }

    if (data.type === NEUD_DATA_UPDATE && data.payload && typeof data.payload === "object") {
      return {
        snapshot: data.payload,
        revision: data.revision != null ? data.revision : null,
      };
    }

    return null;
  }

  function resolveCanonicalDisplaySnapshot(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    var candidate =
      payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? payload.data
        : payload;

    if (
      candidate &&
      (candidate.current ||
        candidate.dataSource ||
        Array.isArray(candidate.next) ||
        candidate.auctionDisplay ||
        candidate.broadArrowDisplay ||
        Array.isArray(candidate.lots) ||
        candidate.lastSold ||
        candidate.prev)
    ) {
      return candidate;
    }

    return null;
  }

  window.__NEUD_HOSTED_BRIDGE_UTILS__ = {
    isHostedDisplayMode: isHostedDisplayMode,
    isHostedBridgeDebugEnabled: isHostedBridgeDebugEnabled,
    isAllowedNeudHostedMessage: isAllowedNeudHostedMessage,
    unwrapNeudDataUpdateMessage: unwrapNeudDataUpdateMessage,
    resolveCanonicalDisplaySnapshot: resolveCanonicalDisplaySnapshot,
  };
})();
