(function (global) {
  "use strict";

  const CHANNEL_NAME = "neud-display-connection";
  const STATUS_HEARTBEAT_MS = 30000;
  const RECOVERY_POLL_MS = 60000;
  const CONNECTION_EVENT_TYPE = "neud-display-connection-changed";
  const DISPLAY_DATA_CHANGED = "neud-display-data-changed";
  const DISPLAY_BRIDGE_SYNC = "neud-display-bridge.sync";

  function deriveDisplayBridgeEventsUrl(options) {
    if (options && options.displayBridgeEventsUrl) {
      return options.displayBridgeEventsUrl;
    }
    var projectId = options && options.projectId;
    var localApiBase =
      (options && options.localApiBase) || "http://127.0.0.1:8070";
    if (!projectId) {
      try {
        var config = global.__NEUD_DISPLAY_CONFIG__ || {};
        if (typeof config.displayBridgeEventsUrl === "string") {
          return config.displayBridgeEventsUrl;
        }
        var info =
          config.displayInfo && typeof config.displayInfo === "object"
            ? config.displayInfo
            : {};
        projectId = info.projectId;
        if (config.localApiBase) {
          localApiBase = config.localApiBase;
        }
      } catch (_) {
        /* ignore */
      }
    }
    if (projectId && typeof projectId === "string") {
      return (
        String(localApiBase).replace(/\/$/, "") +
        "/api/projects/" +
        encodeURIComponent(projectId) +
        "/display-bridge/events"
      );
    }
    return null;
  }

  function deriveEnabledEndpoint(dataUrl) {
    if (!dataUrl) return null;
    const withoutQuery = dataUrl.split("?")[0];
    if (withoutQuery.endsWith("/data")) {
      return withoutQuery.slice(0, -"data".length) + "enabled";
    }
    return null;
  }

  function deriveStatusEndpoint(dataUrl) {
    if (!dataUrl) return null;
    const withoutQuery = dataUrl.split("?")[0];
    if (withoutQuery.endsWith("/data")) {
      return withoutQuery.slice(0, -"data".length) + "status";
    }
    return null;
  }

  function isDisconnectedPayload(json) {
    return (
      !json ||
      json.enabled === false ||
      json.status === "display_disabled" ||
      json.dataConnected === false
    );
  }

  function isConnectedStatus(json) {
    return Boolean(json && (json.dataConnected === true || json.enabled === true));
  }

  function normalizeDisplayPayload(json) {
    if (!json || typeof json !== "object") {
      return json;
    }
    if (json.snapshot && typeof json.snapshot === "object") {
      return Object.assign({}, json, json.snapshot);
    }
    return json;
  }

  function createDisplayDataPoller(options) {
    const displayId = options.displayId;
    const dataUrl = options.dataUrl;
    const statusUrl = options.statusUrl || deriveStatusEndpoint(dataUrl);
    const enabledUrl = options.enabledUrl || deriveEnabledEndpoint(dataUrl);
    const pollMs = Math.max(250, options.pollMs || 1000);
    const onPayload = options.onPayload;
    const onDisconnected = options.onDisconnected;
    const onReconnected = options.onReconnected;

    const pollerKey = String(displayId || "") + "|" + String(dataUrl || "");
    if (global.__NEUD_ACTIVE_DISPLAY_POLLERS__?.has(pollerKey)) {
      global.__NEUD_ACTIVE_DISPLAY_POLLERS__.get(pollerKey).stop();
    }
    if (!global.__NEUD_ACTIVE_DISPLAY_POLLERS__) {
      global.__NEUD_ACTIVE_DISPLAY_POLLERS__ = new Map();
    }

    let pollTimer = null;
    let statusTimer = null;
    let dataRequest = null;
    let statusRequest = null;
    let isPolling = false;
    let dataConnected = true;
    let dataInFlight = false;
    let disconnectNotified = false;
    let reconnectBlocked = false;
    let lastPayload = null;
    let pendingDataRefresh = false;
    let recoveryTimer = null;
    let displayBridgeEventSource = null;
    let lastAppliedRevision = null;
    let lastAppliedContentHash = null;
    const diagnostics = {
      displayUpdateMode: "event-driven",
      initialFetchCount: 0,
      changeEventsReceived: 0,
      dataFetchesTriggeredByEvent: 0,
      coalescedEvents: 0,
      pollTimerActive: false,
      recoveryTimerActive: false,
      lastChangeEventAt: null,
      lastAppliedAt: null,
      displayBridgeEventsConnected: false,
    };

    const clientHeaders = {
      "X-NEUD-Display-Client": "display-runtime",
    };

    function abortDataRequest() {
      if (dataRequest) {
        dataRequest.abort();
        dataRequest = null;
      }
    }

    function abortStatusRequest() {
      if (statusRequest) {
        statusRequest.abort();
        statusRequest = null;
      }
    }

    function stopPolling() {
      isPolling = false;
      dataInFlight = false;
      pendingDataRefresh = false;

      if (pollTimer !== null) {
        global.clearInterval(pollTimer);
        pollTimer = null;
      }
      if (recoveryTimer !== null) {
        global.clearInterval(recoveryTimer);
        recoveryTimer = null;
      }
      diagnostics.pollTimerActive = false;
      diagnostics.recoveryTimerActive = false;

      abortDataRequest();
    }

    function scheduleDataRefresh(fromEvent) {
      if (!dataUrl) {
        return;
      }
      if (!isPolling) {
        isPolling = true;
        dataConnected = true;
      }
      if (fromEvent) {
        diagnostics.changeEventsReceived += 1;
        diagnostics.dataFetchesTriggeredByEvent += 1;
        diagnostics.lastChangeEventAt = new Date().toISOString();
      }
      if (dataInFlight) {
        pendingDataRefresh = true;
        diagnostics.coalescedEvents += 1;
        return;
      }
      void pollOnce();
    }

    function stopStatusHeartbeat() {
      if (statusTimer !== null) {
        global.clearInterval(statusTimer);
        statusTimer = null;
      }

      abortStatusRequest();
    }

    function stopDisplayBridgeEvents() {
      if (displayBridgeEventSource) {
        displayBridgeEventSource.close();
        displayBridgeEventSource = null;
      }
      diagnostics.displayBridgeEventsConnected = false;
    }

    function shouldSkipBridgeNotification(payload) {
      if (!payload || payload.revision == null) {
        return false;
      }
      if (lastAppliedRevision == null) {
        return false;
      }
      if (payload.revision > lastAppliedRevision) {
        return false;
      }
      if (payload.revision < lastAppliedRevision) {
        return true;
      }
      if (
        payload.contentHash &&
        lastAppliedContentHash &&
        payload.contentHash !== lastAppliedContentHash
      ) {
        return false;
      }
      return payload.revision === lastAppliedRevision;
    }

    function bridgeNotificationProjectMatches(payload) {
      if (!payload || !payload.projectId) {
        return true;
      }
      var expectedProjectId = options.projectId;
      if (!expectedProjectId) {
        try {
          var config = global.__NEUD_DISPLAY_CONFIG__ || {};
          var info =
            config.displayInfo && typeof config.displayInfo === "object"
              ? config.displayInfo
              : {};
          expectedProjectId = info.projectId;
        } catch (_) {
          expectedProjectId = null;
        }
      }
      if (expectedProjectId && payload.projectId !== expectedProjectId) {
        return false;
      }
      return true;
    }

    function handleBridgeNotification(payload) {
      if (!bridgeNotificationProjectMatches(payload)) {
        return;
      }
      if (shouldSkipBridgeNotification(payload)) {
        diagnostics.coalescedEvents += 1;
        return;
      }
      scheduleDataRefresh(
        payload && payload.type === DISPLAY_DATA_CHANGED,
      );
    }

    function startDisplayBridgeEvents() {
      var eventsUrl = deriveDisplayBridgeEventsUrl(options);
      if (!eventsUrl || typeof EventSource === "undefined") {
        return;
      }
      stopDisplayBridgeEvents();
      try {
        displayBridgeEventSource = new EventSource(eventsUrl);
        displayBridgeEventSource.addEventListener(DISPLAY_DATA_CHANGED, function (event) {
          try {
            handleBridgeNotification(JSON.parse(event.data));
          } catch (_) {
            scheduleDataRefresh(true);
          }
        });
        displayBridgeEventSource.addEventListener(DISPLAY_BRIDGE_SYNC, function (event) {
          try {
            handleBridgeNotification(JSON.parse(event.data));
          } catch (_) {
            scheduleDataRefresh(false);
          }
        });
        displayBridgeEventSource.onopen = function () {
          diagnostics.displayBridgeEventsConnected = true;
        };
        displayBridgeEventSource.onerror = function () {
          diagnostics.displayBridgeEventsConnected = false;
        };
      } catch (_) {
        stopDisplayBridgeEvents();
      }
    }

    function stopAll() {
      stopPolling();
      stopStatusHeartbeat();
      stopDisplayBridgeEvents();
    }

    function setDisconnectedState() {
      stopPolling();
      reconnectBlocked = true;

      if (!dataConnected && disconnectNotified) {
        return;
      }

      dataConnected = false;
      disconnectNotified = true;

      if (statusUrl || enabledUrl) {
        startStatusHeartbeat();
      }

      if (typeof onDisconnected === "function") {
        onDisconnected(lastPayload);
      }
    }

    function setConnectedState() {
      if (reconnectBlocked && !dataConnected) {
        return;
      }

      if (dataConnected && isPolling) {
        return;
      }

      dataConnected = true;
      disconnectNotified = false;
      reconnectBlocked = false;
      stopStatusHeartbeat();
      startPolling(pollMs);

      if (typeof onReconnected === "function") {
        onReconnected();
      }
    }

    function handleConnectionPayload(payload) {
      if (!payload || payload.displayId !== displayId) return;

      if (payload.type === "neud-display-reload-request") {
        global.location.reload();
        return;
      }

      if (payload.type === "neud-display-data-changed") {
        if (
          payload.displayId &&
          displayId &&
          payload.displayId !== displayId
        ) {
          return;
        }
        scheduleDataRefresh(true);
        return;
      }

      if (payload.enabled === false || payload.dataConnected === false) {
        reconnectBlocked = true;
        setDisconnectedState();
        global.setTimeout(function () {
          global.location.reload();
        }, 0);
        return;
      }

      if (payload.enabled === true || payload.dataConnected === true) {
        reconnectBlocked = false;
        setConnectedState();
      }
    }

    async function pollOnce() {
      if (!isPolling || !dataUrl) {
        return;
      }

      if (dataInFlight) {
        return;
      }

      dataInFlight = true;
      abortDataRequest();
      const controller = new AbortController();
      dataRequest = controller;

      try {
        const url = dataUrl + (dataUrl.includes("?") ? "&" : "?") + "_=" + Date.now();
        const response = await global.fetch(url, {
          cache: "no-store",
          signal: controller.signal,
          headers: clientHeaders,
        });

        if (!isPolling) {
          return;
        }

        if (
          response.status === 409 ||
          response.status === 423 ||
          response.status === 403
        ) {
          setDisconnectedState();
          return;
        }

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          if (isDisconnectedPayload(errorPayload)) {
            setDisconnectedState();
            return;
          }
          throw new Error("Display data request failed: " + response.status);
        }

        const json = await response.json();
        if (isDisconnectedPayload(json)) {
          setDisconnectedState();
          return;
        }

        if (
          json.revision != null &&
          lastAppliedRevision != null &&
          json.revision < lastAppliedRevision
        ) {
          return;
        }
        lastPayload = normalizeDisplayPayload(json);
        if (json.revision != null) {
          lastAppliedRevision = json.revision;
        }
        if (json.contentHash && typeof json.contentHash === "string") {
          lastAppliedContentHash = json.contentHash;
        }
        diagnostics.lastAppliedAt = new Date().toISOString();
        if (typeof onPayload === "function") {
          onPayload(lastPayload, json.revision ?? 0);
        }
      } catch (error) {
        if (error && error.name === "AbortError") {
          return;
        }
        if (isPolling && lastPayload && typeof onPayload === "function") {
          onPayload(lastPayload, lastPayload.revision ?? 0);
        }
        if (isPolling) {
          console.error("[DisplayRuntime] poll failed", error);
        }
      } finally {
        dataInFlight = false;
        if (dataRequest === controller) {
          dataRequest = null;
        }
        if (pendingDataRefresh) {
          pendingDataRefresh = false;
          void pollOnce();
        }
      }
    }

    async function pollStatusOnce() {
      const endpoint = statusUrl || enabledUrl;
      if (!endpoint) return;

      abortStatusRequest();
      const controller = new AbortController();
      statusRequest = controller;

      try {
        const response = await global.fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
          headers: clientHeaders,
        });
        if (!response.ok) return;

        const json = await response.json();
        if (isConnectedStatus(json)) {
          reconnectBlocked = false;
          setConnectedState();
        }
      } catch (error) {
        if (error && error.name === "AbortError") return;
      } finally {
        if (statusRequest === controller) {
          statusRequest = null;
        }
      }
    }

    function startPolling(intervalMs) {
      stopPolling();
      isPolling = true;
      dataConnected = true;
      disconnectNotified = false;
      diagnostics.initialFetchCount += 1;
      void pollOnce();
      if (recoveryTimer === null) {
        recoveryTimer = global.setInterval(function () {
          if (isPolling && dataConnected && !dataInFlight) {
            void pollOnce();
          }
        }, RECOVERY_POLL_MS);
        diagnostics.recoveryTimerActive = true;
      }
      diagnostics.pollTimerActive = false;
    }

    function startStatusHeartbeat() {
      stopStatusHeartbeat();
      void pollStatusOnce();
      statusTimer = global.setInterval(function () {
        void pollStatusOnce();
      }, STATUS_HEARTBEAT_MS);
    }

    function start() {
      startPolling(pollMs);
      startDisplayBridgeEvents();
    }

    function stop() {
      dataConnected = false;
      disconnectNotified = false;
      stopAll();
    }

    function onConnectionEvent(event) {
      handleConnectionPayload(event.data);
    }

    function onWindowMessage(event) {
      const payload = event.data;
      if (!payload || typeof payload !== "object") return;
      if (
        payload.type !== CONNECTION_EVENT_TYPE &&
        payload.type !== "neud-display-reload-request" &&
        payload.type !== "neud-display-data-changed"
      ) {
        return;
      }
      handleConnectionPayload(payload);
    }

    function onCustomConnectionEvent(event) {
      handleConnectionPayload(event.detail);
    }

    let channel = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = onConnectionEvent;
    } catch (_) {
      /* BroadcastChannel unavailable */
    }

    function onForcedDisconnect() {
      reconnectBlocked = true;
      setDisconnectedState();
    }

    global.addEventListener("message", onWindowMessage);
    global.addEventListener(CONNECTION_EVENT_TYPE, onCustomConnectionEvent);
    global.addEventListener("neud-display-data-disconnected", onForcedDisconnect);
    global.addEventListener("beforeunload", function () {
      stop();
      global.__NEUD_ACTIVE_DISPLAY_POLLERS__?.delete(pollerKey);
      global.removeEventListener("message", onWindowMessage);
      global.removeEventListener(CONNECTION_EVENT_TYPE, onCustomConnectionEvent);
      global.removeEventListener("neud-display-data-disconnected", onForcedDisconnect);
      if (channel) channel.close();
    });

    const poller = {
      start,
      stop,
      startPolling,
      stopPolling,
      getLastPayload: function () {
        return lastPayload;
      },
      isDataConnected: function () {
        return dataConnected;
      },
      isPolling: function () {
        return isPolling;
      },
      getDiagnostics: function () {
        return Object.assign({}, diagnostics);
      },
    };

    global.__NEUD_ACTIVE_DISPLAY_POLLERS__.set(pollerKey, poller);
    return poller;
  }

  function postConnectionChange(displayId, enabled) {
    const payload = {
      type: CONNECTION_EVENT_TYPE,
      displayId: displayId,
      enabled: enabled,
      dataConnected: enabled,
      updatedAt: new Date().toISOString(),
      timestamp: Date.now(),
    };

    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    } catch (_) {
      /* ignore */
    }

    try {
      global.postMessage(payload, global.location.origin);
    } catch (_) {
      /* ignore */
    }
  }

  function showDisplayOffPage() {
    global.document.body.innerHTML =
      '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;color:#fff;background:rgba(5,8,13,0.85);font-size:42px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;opacity:0.85;">Display Off</div>';
  }

  async function fetchInitialConnectionState(dataUrl) {
    const statusUrl = deriveStatusEndpoint(dataUrl);
    const enabledUrl = deriveEnabledEndpoint(dataUrl);
    const endpoint = statusUrl || enabledUrl;
    if (!endpoint) return true;

    try {
      const response = await global.fetch(endpoint, {
        cache: "no-store",
        headers: { "X-NEUD-Display-Client": "display-runtime" },
      });
      if (!response.ok) return false;
      const json = await response.json();
      return isConnectedStatus(json);
    } catch (_) {
      return false;
    }
  }

  global.NEUDDisplayConnection = {
    CHANNEL_NAME,
    CONNECTION_EVENT_TYPE,
    STATUS_HEARTBEAT_MS,
    deriveEnabledEndpoint,
    deriveStatusEndpoint,
    createDisplayDataPoller,
    postConnectionChange,
    showDisplayOffPage,
    fetchInitialConnectionState,
  };
})(window);
