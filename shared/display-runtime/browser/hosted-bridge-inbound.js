(function installNeudHostedBridgeInbound(global) {
  var root = global || (typeof window !== "undefined" ? window : globalThis);
  var NEUD_RUNTIME_SOURCE = "neud-runtime";
  var NEUD_DATA_UPDATE = "NEUD_DATA_UPDATE";
  var NEUD_DATA_UPDATE_RECEIVED = "NEUD_DATA_UPDATE_RECEIVED";
  var NEUD_HOSTED_BRIDGE_STATUS = "NEUD_HOSTED_BRIDGE_STATUS";
  var NEUD_HOSTED_BRIDGE_BOOTED = "NEUD_HOSTED_BRIDGE_BOOTED";
  var NEUD_HOSTED_BRIDGE_ERROR = "NEUD_HOSTED_BRIDGE_ERROR";
  var NEUD_HOSTED_BRIDGE_REJECTED = "NEUD_HOSTED_BRIDGE_REJECTED";
  var NEUD_LAYOUT_REFRESH = "NEUD_LAYOUT_REFRESH";
  var NEUD_DISPLAY_SOURCE = "neud-display";
  var BRIDGE_VERSION = "3";
  var bootState = {
    scriptStarted: false,
    listenerInstalled: false,
    runtimeGlobalPresentAtBoot: false,
    publishFunctionPresentAtBoot: false,
    bootMessageSent: false,
    bootErrorCategory: null,
    bootSequence: 0,
  };

  function postToParent(message) {
    try {
      root.parent.postMessage(message, "*");
    } catch (_) {}
  }

  function notifyBootError(stage, errorCategory) {
    bootState.bootErrorCategory = errorCategory;
    postToParent({
      source: NEUD_RUNTIME_SOURCE,
      type: NEUD_HOSTED_BRIDGE_ERROR,
      version: 1,
      stage: stage,
      errorCategory: errorCategory,
    });
  }

  function isHostedMode() {
    return root.__NEUD_DISPLAY_DATA_DISCONNECTED__ === true;
  }

  function isDebugEnabled() {
    if (!isHostedMode()) {
      return false;
    }
    try {
      return new URLSearchParams(root.location.search).get("neudDebug") === "1";
    } catch (_) {
      return false;
    }
  }

  function isTrustedParentMessage(event) {
    try {
      return event.source === root.parent;
    } catch (_) {
      return false;
    }
  }

  function notifyRejection(reason) {
    if (!isDebugEnabled()) {
      return;
    }
    postToParent({
      source: NEUD_RUNTIME_SOURCE,
      type: NEUD_HOSTED_BRIDGE_REJECTED,
      version: 1,
      reason: reason,
    });
  }

  function unwrapNeudLayoutRefresh(data) {
    if (!data || typeof data !== "object") {
      return { error: "missing_payload" };
    }
    if (data.source !== NEUD_RUNTIME_SOURCE) {
      return { error: "wrong_source_marker" };
    }
    if (data.type !== NEUD_LAYOUT_REFRESH) {
      return { error: "wrong_message_type" };
    }
    if (data.version != null && Number(data.version) !== 1) {
      return { error: "unsupported_version" };
    }
    return {
      reason: typeof data.reason === "string" ? data.reason : "layout_refresh",
    };
  }

  function dispatchLayoutRefresh(reason) {
    var detail = { reason: reason || "layout_refresh" };
    try {
      root.dispatchEvent(new CustomEvent("neud:display-layout-ready", { detail: detail }));
    } catch (_) {}
    if (typeof root.__neudRefreshStreamTickerLayout === "function") {
      root.__neudRefreshStreamTickerLayout(detail.reason);
    }
    if (root.NEUDDisplay && typeof root.NEUDDisplay.refreshLayout === "function") {
      root.NEUDDisplay.refreshLayout(detail.reason);
    }
  }

  function unwrapNeudDataUpdate(data) {
    if (!data || typeof data !== "object") {
      return { error: "missing_payload" };
    }
    if (data.source !== NEUD_RUNTIME_SOURCE) {
      return { error: "wrong_source_marker" };
    }
    if (data.type !== NEUD_DATA_UPDATE) {
      return { error: "wrong_message_type" };
    }
    if (data.version != null && Number(data.version) !== 1) {
      return { error: "unsupported_version" };
    }
    if (!data.payload || typeof data.payload !== "object" || Array.isArray(data.payload)) {
      return { error: "missing_payload" };
    }
    return {
      update: {
        snapshot: data.payload,
        revision: data.revision != null ? data.revision : null,
      },
    };
  }

  function notifyParentStatus(status) {
    if (!isHostedMode()) {
      return;
    }
    postToParent(
      Object.assign({ source: NEUD_DISPLAY_SOURCE, type: NEUD_HOSTED_BRIDGE_STATUS }, status),
    );
  }

  function notifyRuntimeAck(revision, runtime, snapshot) {
    if (!isHostedMode()) {
      return;
    }
    var subscriberCount =
      runtime && Array.isArray(runtime._subscribers) ? runtime._subscribers.length : 0;
    postToParent({
      source: NEUD_RUNTIME_SOURCE,
      type: NEUD_DATA_UPDATE_RECEIVED,
      version: 1,
      revision: revision != null ? revision : null,
      runtimeGlobalPresent: Boolean(runtime && typeof runtime._publish === "function"),
      subscriberCount: subscriberCount,
      adapterInputShapeKeys:
        snapshot && typeof snapshot === "object" ? Object.keys(snapshot) : [],
      runtimeInputNormalized: Boolean(snapshot),
    });
  }

  function dispatchInboundUpdate(update) {
    var normalize =
      typeof root.resolveDisplayRuntimeSnapshot === "function"
        ? root.resolveDisplayRuntimeSnapshot
        : null;
    var snapshot = normalize ? normalize(update.snapshot) : null;
    if (!snapshot) {
      notifyParentStatus({
        iframeUpdateReceived: true,
        renderUpdateCompleted: false,
        renderErrorCategory: "invalid_snapshot",
        adapterInputShapeKeys: [],
        runtimeInputNormalized: false,
        payloadShapeVersion: root.DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION || null,
      });
      return;
    }

    var runtime = root.NEUDDisplay;
    var subscriberCount =
      runtime && Array.isArray(runtime._subscribers) ? runtime._subscribers.length : 0;
    var dispatchMethod = "none";

    if (runtime && typeof runtime._publish === "function") {
      runtime._publish(snapshot, { revision: update.revision });
      dispatchMethod = "_publish";
    } else if (typeof root.publishRuntimeSnapshot === "function" && runtime) {
      root.publishRuntimeSnapshot(runtime, snapshot, { revision: update.revision });
      dispatchMethod = "publishRuntimeSnapshot";
    }

    if (isDebugEnabled()) {
      console.debug("[NEUD Hosted Bridge] update_received", {
        revision: update.revision,
        topLevelKeys: Object.keys(snapshot),
        runtimeGlobalPresent: Boolean(runtime),
        subscriberCount: subscriberCount,
        dispatchMethod: dispatchMethod,
      });
    }

    notifyParentStatus({
      iframeUpdateReceived: true,
      runtimeSubscribersCount: subscriberCount,
      lastSubscriberInvocationAt: new Date().toISOString(),
      adapterInputShapeKeys: Object.keys(snapshot),
      renderUpdateCompleted: dispatchMethod !== "none",
      runtimeInputNormalized: true,
      payloadShapeVersion: root.DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION || null,
    });
    notifyRuntimeAck(update.revision, runtime, snapshot);
  }

  function onInboundMessage(event) {
    if (!isHostedMode()) {
      return;
    }
    if (!isTrustedParentMessage(event)) {
      notifyRejection("wrong_source_window");
      return;
    }

    if (event.data && event.data.type === NEUD_LAYOUT_REFRESH) {
      var layoutParsed = unwrapNeudLayoutRefresh(event.data);
      if (layoutParsed.error) {
        notifyRejection(layoutParsed.error);
        return;
      }
      dispatchLayoutRefresh(layoutParsed.reason);
      return;
    }

    var parsed = unwrapNeudDataUpdate(event.data);
    if (parsed.error) {
      notifyRejection(parsed.error);
      return;
    }
    if (!parsed.update) {
      notifyRejection("missing_payload");
      return;
    }
    dispatchInboundUpdate(parsed.update);
  }

  try {
    if (root.__NEUD_HOSTED_BRIDGE_INBOUND__) {
      return;
    }
    root.__NEUD_HOSTED_BRIDGE_INBOUND__ = true;
    bootState.scriptStarted = true;
    bootState.bootSequence = 1;

    if (typeof root.createNeudDisplayBridge === "function" && !root.NEUDDisplay) {
      root.NEUDDisplay = root.createNeudDisplayBridge();
    }
    bootState.bootSequence = 2;
    bootState.runtimeGlobalPresentAtBoot = Boolean(root.NEUDDisplay);
    bootState.publishFunctionPresentAtBoot = Boolean(
      root.NEUDDisplay && typeof root.NEUDDisplay._publish === "function",
    );

    root.addEventListener("message", onInboundMessage);
    bootState.listenerInstalled = true;
    bootState.bootSequence = 3;

    root.__NEUD_HOSTED_BRIDGE__ = {
      notifyStatus: notifyParentStatus,
      isHostedMode: isHostedMode,
      isDebugEnabled: isDebugEnabled,
      bootState: bootState,
    };

    postToParent({
      source: NEUD_RUNTIME_SOURCE,
      type: NEUD_HOSTED_BRIDGE_BOOTED,
      version: 1,
      bridgeVersion: BRIDGE_VERSION,
      runtimeGlobalPresent: bootState.runtimeGlobalPresentAtBoot,
      publishFunctionPresent: bootState.publishFunctionPresentAtBoot,
      inboundListenerInstalled: true,
      bootSequence: bootState.bootSequence,
    });
    bootState.bootMessageSent = true;
  } catch (_) {
    notifyBootError("bootstrap", "bootstrap_exception");
  }
})(typeof window !== "undefined" ? window : globalThis);
