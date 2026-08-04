(function () {
  "use strict";

  var NEUD_DISPLAY_SOURCE = "neud-display";
  var NEUD_RUNTIME_SOURCE = "neud-runtime";
  var NEUD_DISPLAY_READY = "NEUD_DISPLAY_READY";
  var NEUD_DATA_UPDATE = "NEUD_DATA_UPDATE";
  var NEUD_DISPLAY_BRIDGE_ACK = "NEUD_DISPLAY_BRIDGE_ACK";

  if (window.__NEUD_DISPLAY_RUNTIME_LOADED__) {
    return;
  }
  window.__NEUD_DISPLAY_RUNTIME_LOADED__ = true;

  window.NEUDDisplay = window.NEUDDisplay || {
    _subscribers: [],
    _snapshot: null,
    _displayInfo: null,
    _ready: false,
    subscribe: function (callback) {
      this._subscribers.push(callback);
      if (this._snapshot) {
        try {
          callback(this._snapshot);
        } catch (error) {
          reportError("subscriber callback failed", error);
        }
      }
      var self = this;
      return function () {
        self._subscribers = self._subscribers.filter(function (entry) {
          return entry !== callback;
        });
      };
    },
    getSnapshot: function () {
      return this._snapshot;
    },
    getDisplayInfo: function () {
      return this._displayInfo || null;
    },
    signalReady: function () {
      this._ready = true;
      try {
        window.dispatchEvent(new CustomEvent("NEUD_DISPLAY_READY"));
      } catch (_) {}
      try {
        window.postMessage(
          { source: NEUD_DISPLAY_SOURCE, type: NEUD_DISPLAY_READY },
          window.location.origin,
        );
      } catch (_) {}
    },
    _publish: function (snapshot, displayInfo) {
      this._snapshot = snapshot;
      this._displayInfo = displayInfo;
      window.NEUD_DATA = snapshot;
      window.displayData = snapshot;
      try {
        window.dispatchEvent(new CustomEvent("neud:data", { detail: snapshot }));
      } catch (_) {}
      try {
        window.postMessage(
          {
            source: NEUD_RUNTIME_SOURCE,
            type: NEUD_DATA_UPDATE,
            version: 1,
            payload: snapshot,
            revision:
              displayInfo && displayInfo.revision != null ? displayInfo.revision : null,
          },
          window.location.origin,
        );
      } catch (_) {}
      if (typeof window.updateDisplay === "function") {
        try {
          window.updateDisplay(snapshot);
        } catch (error) {
          reportError("updateDisplay hook failed", error);
        }
      }
      for (var i = 0; i < this._subscribers.length; i++) {
        try {
          this._subscribers[i](snapshot);
        } catch (error) {
          reportError("subscriber callback failed", error);
        }
      }
    },
  };

  var config = window.__NEUD_DISPLAY_CONFIG__ || {};
  var dataUrl = typeof config.dataUrl === "string" ? config.dataUrl : "";
  var displayInfo = config.displayInfo && typeof config.displayInfo === "object"
    ? config.displayInfo
    : {};
  var projectId = typeof displayInfo.projectId === "string" ? displayInfo.projectId : null;
  var liveEventsUrl =
    typeof config.liveEventsUrl === "string"
      ? config.liveEventsUrl
      : projectId
        ? String(config.localApiBase || "http://127.0.0.1:8070").replace(/\/$/, "") +
          "/api/projects/" +
          encodeURIComponent(projectId) +
          "/bag/live/events"
        : null;

  var isEmbedded = window.parent && window.parent !== window;
  var pollTimer = null;
  var activeRequest = null;
  var eventSource = null;
  var bridgeReady = false;
  var runtimeStarted = false;
  var latestSnapshot = null;
  var latestRevision = null;

  function reportError(message, error) {
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error("[NEUD Display Runtime] " + message, error || "");
    }
  }

  function debugLog(message) {
    if (config.debug && typeof console !== "undefined" && typeof console.debug === "function") {
      console.debug("[NEUD Display Runtime] " + message);
    }
  }

  function readPollIntervalMs() {
    if (typeof config.pollIntervalMs === "number" && config.pollIntervalMs >= 250) {
      return config.pollIntervalMs;
    }
    try {
      var parsed = Number(new URLSearchParams(window.location.search).get("poll"));
      if (Number.isFinite(parsed) && parsed >= 250) {
        return parsed;
      }
    } catch (_) {}
    return 1000;
  }

  var pollIntervalMs = readPollIntervalMs();

  function stopPolling() {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    if (activeRequest) {
      activeRequest.abort();
      activeRequest = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  window.__NEUD_RUNTIME_STOP__ = stopPolling;

  function resumePolling() {
    window.__NEUD_DISPLAY_DATA_DISCONNECTED__ = false;
    if (!dataUrl || !bridgeReady) {
      return;
    }
    stopPolling();
    void fetchLatest();
    if (!pollTimer && dataUrl && !window.__NEUD_DISPLAY_DATA_DISCONNECTED__) {
      pollTimer = window.setInterval(fetchLatest, pollIntervalMs);
    }
  }

  window.__NEUD_RUNTIME_RESUME__ = resumePolling;

  function setPollIntervalMs(nextIntervalMs) {
    if (!Number.isFinite(nextIntervalMs) || nextIntervalMs < 250) {
      return;
    }
    pollIntervalMs = nextIntervalMs;
    if (config.debug && typeof console !== "undefined" && typeof console.debug === "function") {
      console.debug("[NEUD Display Runtime] poll interval updated", {
        slug: displayInfo.slug || null,
        pollIntervalMs: pollIntervalMs,
      });
    }
    resumePolling();
  }

  window.__NEUD_RUNTIME_SET_POLL_INTERVAL__ = setPollIntervalMs;

  function resolveCanonicalSnapshot(payload) {
    if (typeof resolveDisplayRuntimeSnapshot === "function") {
      return resolveDisplayRuntimeSnapshot(payload);
    }
    if (!payload || typeof payload !== "object") {
      return null;
    }
    var candidate =
      payload.snapshot && typeof payload.snapshot === "object"
        ? payload.snapshot
        : payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
          ? payload.data
          : payload.broadArrowDisplay && typeof payload.broadArrowDisplay === "object"
            ? payload.broadArrowDisplay
            : payload;
    if (
      candidate &&
      (candidate.current ||
        candidate.dataSource ||
        Array.isArray(candidate.next) ||
        candidate.auctionDisplay ||
        candidate.pylon ||
        candidate.ticker)
    ) {
      if (candidate.pylon || candidate.ticker) {
        var merged = {};
        if (candidate.pylon && candidate.pylon.auctionDisplay) {
          merged.auctionDisplay = candidate.pylon.auctionDisplay;
        } else if (candidate.pylon) {
          merged.auctionDisplay = candidate.pylon;
        }
        if (candidate.ticker && Array.isArray(candidate.ticker.next)) {
          merged.next = candidate.ticker.next;
        }
        merged.updatedAt = candidate.updatedAt || null;
        merged.dataSource = candidate.dataSource || payload.dataSource || null;
        return merged;
      }
      return candidate;
    }
    return null;
  }

  function notifyParentAck(revision) {
    if (!isEmbedded) {
      return;
    }
    try {
      window.parent.postMessage(
        {
          type: NEUD_DISPLAY_BRIDGE_ACK,
          displayId: displayInfo.displayId || null,
          projectId: displayInfo.projectId || null,
          revision: revision != null ? revision : null,
        },
        window.location.origin,
      );
    } catch (error) {
      reportError("bridge ack failed", error);
    }
  }

  function isAllowedMessageOrigin(origin) {
    if (!origin || origin === "null") {
      return true;
    }
    if (origin === window.location.origin) {
      return true;
    }
    return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin);
  }

  function publishSnapshot(snapshot, meta) {
    if (window.NEUDDisplay && typeof window.NEUDDisplay._publish === "function") {
      window.NEUDDisplay._publish(snapshot, meta);
    }
    notifyParentAck(meta.revision != null ? meta.revision : null);
    debugLog("snapshot delivered");
  }

  function deliverLatestSnapshot() {
    if (!bridgeReady || latestSnapshot == null) {
      return;
    }
    publishSnapshot(latestSnapshot, {
      projectId: displayInfo.projectId || null,
      displayId: displayInfo.displayId || null,
      slug: displayInfo.slug || null,
      name: displayInfo.name || null,
      revision: latestRevision,
      enabled: true,
    });
  }

  function markBridgeReady() {
    if (bridgeReady) {
      deliverLatestSnapshot();
      return;
    }
    bridgeReady = true;
    debugLog("runtime connected");
    deliverLatestSnapshot();
    if (!runtimeStarted) {
      runtimeStarted = true;
      if (!isEmbedded && liveEventsUrl && typeof EventSource !== "undefined") {
        startLiveEvents();
      } else if (dataUrl) {
        void fetchLatest();
        pollTimer = window.setInterval(fetchLatest, pollIntervalMs);
      }
    }
  }

  async function fetchLatest() {
    if (!dataUrl || window.__NEUD_DISPLAY_DATA_DISCONNECTED__) {
      stopPolling();
      return;
    }

    activeRequest && activeRequest.abort();
    activeRequest = new AbortController();
    try {
      var response = await fetch(dataUrl, {
        cache: "no-store",
        signal: activeRequest.signal,
        headers: { "X-NEUD-Display-Client": "neud-display-runtime" },
      });
      if (response.status === 409 || response.status === 423 || response.status === 403) {
        stopPolling();
        return;
      }
      if (!response.ok) {
        return;
      }
      var payload = await response.json();
      if (
        payload.enabled === false ||
        payload.status === "display_disabled" ||
        payload.dataConnected === false
      ) {
        applyPayload(payload);
        stopPolling();
        return;
      }
      applyPayload(payload);
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
      reportError("data fetch failed", error);
    } finally {
      activeRequest = null;
    }
  }

  function applyPayload(payload) {
    var snapshot = resolveCanonicalSnapshot(payload);
    if (!snapshot) {
      return;
    }
    latestSnapshot = snapshot;
    latestRevision = payload.revision != null ? payload.revision : null;
    if (!bridgeReady) {
      debugLog("initial snapshot retained until readiness");
      return;
    }
    publishSnapshot(snapshot, {
      projectId: displayInfo.projectId || null,
      displayId: displayInfo.displayId || null,
      slug: displayInfo.slug || null,
      name: displayInfo.name || null,
      source: payload.source || null,
      revision: latestRevision,
      enabled: payload.enabled !== false,
    });
  }

  function startLiveEvents() {
    if (!liveEventsUrl) {
      return;
    }
    try {
      eventSource = new EventSource(liveEventsUrl);
      eventSource.addEventListener("bag.live-state.updated", function (event) {
        try {
          var envelope = JSON.parse(event.data);
          if (envelope && envelope.state) {
            void fetchLatest();
          }
        } catch (error) {
          reportError("live event parse failed", error);
        }
      });
      eventSource.onerror = function () {
        debugLog("live events disconnected; polling fallback active");
        if (!pollTimer && dataUrl) {
          void fetchLatest();
          pollTimer = window.setInterval(fetchLatest, pollIntervalMs);
        }
      };
      debugLog("live events connected");
      if (dataUrl) {
        void fetchLatest();
      }
    } catch (error) {
      reportError("live events unavailable", error);
      if (dataUrl) {
        void fetchLatest();
        pollTimer = window.setInterval(fetchLatest, pollIntervalMs);
      }
    }
  }

  window.addEventListener("NEUD_DISPLAY_READY", markBridgeReady);
  window.addEventListener("message", function (event) {
    if (!isAllowedMessageOrigin(event.origin)) {
      return;
    }
    var msg = event.data;
    if (
      msg &&
      typeof msg === "object" &&
      msg.source === NEUD_DISPLAY_SOURCE &&
      msg.type === NEUD_DISPLAY_READY
    ) {
      debugLog("display ready handshake received");
      markBridgeReady();
    }
  });
  window.addEventListener("beforeunload", stopPolling);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (window.NEUDDisplay && typeof window.NEUDDisplay.signalReady === "function") {
        window.NEUDDisplay.signalReady();
      } else {
        markBridgeReady();
      }
    });
  } else if (window.NEUDDisplay && typeof window.NEUDDisplay.signalReady === "function") {
    window.NEUDDisplay.signalReady();
  } else {
    markBridgeReady();
  }
})();
