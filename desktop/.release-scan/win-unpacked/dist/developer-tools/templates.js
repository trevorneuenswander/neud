"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISPLAY_FETCH_GUARD_SCRIPT = exports.DISPLAY_BRIDGE_SCRIPT = exports.BLANK_DISPLAY_JAVASCRIPT = exports.BLANK_DISPLAY_CSS = exports.BLANK_DISPLAY_HTML = exports.DEFAULT_SCRAPER_TEMPLATE = void 0;
exports.buildDisplayDocument = buildDisplayDocument;
exports.hasEmbeddedNeudDisplayBridge = hasEmbeddedNeudDisplayBridge;
exports.hasEmbeddedNeudDisplayRuntime = hasEmbeddedNeudDisplayRuntime;
exports.buildDisplayRuntimeScript = buildDisplayRuntimeScript;
exports.buildTransparentOutputShellHtml = buildTransparentOutputShellHtml;
exports.wrapStandaloneDisplayHtml = wrapStandaloneDisplayHtml;
exports.buildDisplayConfigScript = buildDisplayConfigScript;
/**
 * Reference scraper module contract for project-owned Webpage Scraper code.
 * The worker runtime loads published project code when available.
 */
exports.DEFAULT_SCRAPER_TEMPLATE = `/**
 * NEUD Project Webpage Scraper
 *
 * Export a factory that returns a scraper implementing the project contract.
 */
export function createScraper(context) {
  return {
    async start() {
      context.logger.info("Project scraper started.");
    },
    async stop() {
      context.logger.info("Project scraper stopped.");
    },
    async runOnce() {
      context.logger.info("Project scraper runOnce invoked.");
      return {
        capturedAt: new Date().toISOString(),
        records: [],
      };
    },
    async dispose() {
      context.logger.info("Project scraper disposed.");
    },
  };
}
`;
exports.BLANK_DISPLAY_HTML = `<div class="display-root">
  <h1>New NEUD Display</h1>
</div>`;
exports.BLANK_DISPLAY_CSS = `:root {
  color-scheme: dark;
}

html,
body {
  margin: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
}

.display-root {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
}
`;
exports.BLANK_DISPLAY_JAVASCRIPT = `window.addEventListener("DOMContentLoaded", () => {
  if (!window.NEUDDisplay) {
    return;
  }

  window.NEUDDisplay.subscribe((snapshot) => {
    const root = document.querySelector(".display-root");
    if (!root || !snapshot) {
      return;
    }
  });
});
`;
exports.DISPLAY_BRIDGE_SCRIPT = `window.NEUDDisplay = window.NEUDDisplay || {
  _subscribers: [],
  _snapshot: null,
  _displayInfo: null,
  _ready: false,
  subscribe(callback) {
    this._subscribers.push(callback);
    if (this._snapshot) {
      callback(this._snapshot);
    }
    return () => {
      this._subscribers = this._subscribers.filter((entry) => entry !== callback);
    };
  },
  getSnapshot() {
    return this._snapshot;
  },
  getDisplayInfo() {
    return this._displayInfo || null;
  },
  signalReady() {
    this._ready = true;
    try {
      window.dispatchEvent(new CustomEvent("NEUD_DISPLAY_READY"));
    } catch (_) {}
  },
  _publish(snapshot, displayInfo) {
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
          source: "neud-runtime",
          type: "NEUD_DATA_UPDATE",
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
      } catch (_) {}
    }
    for (const callback of this._subscribers) {
      callback(snapshot);
    }
  },
};`;
exports.DISPLAY_FETCH_GUARD_SCRIPT = `(function () {
  if (window.__NEUD_DISPLAY_FETCH_GUARD__) return;
  window.__NEUD_DISPLAY_FETCH_GUARD__ = true;

  function forceStopDisplayPolling() {
    window.__NEUD_DISPLAY_DATA_DISCONNECTED__ = true;
    try {
      if (window.__NEUD_RUNTIME_STOP__) {
        window.__NEUD_RUNTIME_STOP__();
      }
    } catch (_) {}
    try {
      if (window.__NEUD_ACTIVE_DISPLAY_POLLERS__) {
        window.__NEUD_ACTIVE_DISPLAY_POLLERS__.forEach(function (entry) {
          try {
            if (entry && typeof entry.stop === "function") entry.stop();
            else if (entry && typeof entry.stopPolling === "function") entry.stopPolling();
          } catch (_) {}
        });
      }
    } catch (_) {}
    window.dispatchEvent(new CustomEvent("neud-display-data-disconnected"));
  }

  function resumeDisplayPolling() {
    window.__NEUD_DISPLAY_DATA_DISCONNECTED__ = false;
    try {
      if (window.__NEUD_RUNTIME_RESUME__) {
        window.__NEUD_RUNTIME_RESUME__();
      }
    } catch (_) {}
    window.dispatchEvent(new CustomEvent("neud-display-data-connected"));
  }

  var originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var response = await originalFetch(input, init);
    var url = String(typeof input === "string" ? input : (input && input.url) || "");
    if (
      url.indexOf("/api/displays/") !== -1 &&
      url.indexOf("/data") !== -1 &&
      (response.status === 409 || response.status === 423 || response.status === 403)
    ) {
      forceStopDisplayPolling();
    }
    if (
      url.indexOf("/api/display/") !== -1 &&
      url.indexOf("/data") !== -1 &&
      (response.status === 409 || response.status === 423 || response.status === 403)
    ) {
      forceStopDisplayPolling();
    }
    return response;
  };

  window.addEventListener("neud-display-connection-changed", function (event) {
    var detail = event.detail || {};
    if (detail.enabled === false || detail.dataConnected === false) {
      forceStopDisplayPolling();
    } else if (detail.enabled === true || detail.dataConnected === true) {
      resumeDisplayPolling();
    }
  });

  function handleDisplayConnectionMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    var config = window.__NEUD_DISPLAY_CONFIG__ || window.__NEUD_DISPLAY_RUNTIME__ || {};
    var displayInfo = config.displayInfo && typeof config.displayInfo === "object"
      ? config.displayInfo
      : config;
    var displayId = displayInfo.displayId || config.displayId;
    if (displayId && payload.displayId && payload.displayId !== displayId) return;

    if (payload.type === "neud-display-reload-request") {
      window.location.reload();
      return;
    }

    if (
      payload.enabled === false ||
      payload.dataConnected === false ||
      payload.type === "neud-display-connection-changed" &&
        (payload.enabled === false || payload.dataConnected === false)
    ) {
      forceStopDisplayPolling();
      return;
    }

    if (
      payload.enabled === true ||
      payload.dataConnected === true ||
      (payload.type === "neud-display-connection-changed" &&
        (payload.enabled === true || payload.dataConnected === true))
    ) {
      resumeDisplayPolling();
      return;
    }

    if (
      payload.type === "neud-display-refresh-rate-changed" &&
      typeof payload.pollIntervalMs === "number"
    ) {
      try {
        if (window.__NEUD_RUNTIME_SET_POLL_INTERVAL__) {
          window.__NEUD_RUNTIME_SET_POLL_INTERVAL__(payload.pollIntervalMs);
        }
      } catch (_) {}
    }
  }

  try {
    var guardChannel = new BroadcastChannel("neud-display-connection");
    guardChannel.onmessage = function (event) {
      handleDisplayConnectionMessage(event.data);
    };
  } catch (_) {}

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent && event.source !== window) return;
    handleDisplayConnectionMessage(event.data);
  });
})();`;
function buildDisplayDocument(input) {
    const configScript = input.dataUrl
        ? buildDisplayConfigScript({
            dataUrl: input.dataUrl,
            displayInfo: input.displayInfo ?? {},
            localApiBase: input.localApiBase,
            pollIntervalMs: input.pollIntervalMs,
        })
        : "";
    const viewportWidth = input.viewportWidth ?? 1920;
    const viewportHeight = input.viewportHeight ?? 1080;
    const backgroundRule = input.outputMode
        ? "background: transparent !important; background-color: transparent !important;"
        : "";
    const viewportStyle = `
    html, body {
      width: ${viewportWidth}px;
      height: ${viewportHeight}px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      ${backgroundRule}
    }
  `;
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=${viewportWidth}, height=${viewportHeight}, initial-scale=1" />
    <title>${escapeHtml(input.title ?? "NEUD Display")}</title>
    <script>${exports.DISPLAY_FETCH_GUARD_SCRIPT}</script>
    <script>${exports.DISPLAY_BRIDGE_SCRIPT}</script>
    ${configScript}
    <style>${viewportStyle}${input.css ?? ""}</style>
  </head>
  <body>
    ${input.html}
    <script>${input.javascript ?? ""}</script>
    ${input.dataUrl ? `<script src="/neud-display-runtime.js"></script>` : ""}
  </body>
</html>`;
}
/** True only when the HTML already defines the shared NEUDDisplay bridge object. */
function hasEmbeddedNeudDisplayBridge(html) {
    return /window\.NEUDDisplay\s*=\s*window\.NEUDDisplay\s*\|\|/.test(html);
}
/** True only when the served document already includes the shared display runtime. */
function hasEmbeddedNeudDisplayRuntime(html) {
    return (/<script[^>]+src=["'][^"']*neud-display-runtime\.js["']/i.test(html) ||
        /window\.__NEUD_DISPLAY_RUNTIME_LOADED__\s*=\s*true/.test(html));
}
function buildDisplayRuntimeScript(dataUrl, displayInfo) {
    const serializedInfo = JSON.stringify(displayInfo);
    const serializedUrl = JSON.stringify(dataUrl);
    return `(function () {
  const dataUrl = ${serializedUrl};
  const displayInfo = ${serializedInfo};
  window.__NEUD_DISPLAY_RUNTIME__ = displayInfo;

  let pollTimer = null;
  let activeRequest = null;
  let bridgeReady = false;
  let runtimeStarted = false;
  let latestSnapshot = null;
  let latestRevision = null;

  function readPollIntervalMs() {
    try {
      const parsed = Number(new URLSearchParams(window.location.search).get("poll"));
      if (Number.isFinite(parsed) && parsed >= 250) {
        return parsed;
      }
    } catch (_) {}
    return 1000;
  }

  const pollIntervalMs = readPollIntervalMs();

  function debugLog(message) {
    if (typeof console !== "undefined" && typeof console.debug === "function") {
      console.debug(message);
    }
  }

  function stopPolling() {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    if (activeRequest) {
      activeRequest.abort();
      activeRequest = null;
    }
  }

  window.__NEUD_RUNTIME_STOP__ = stopPolling;

  function resolveCanonicalSnapshot(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const candidate =
      payload.snapshot && typeof payload.snapshot === "object"
        ? payload.snapshot
        : payload;
    if (
      candidate &&
      (candidate.current ||
        candidate.dataSource ||
        Array.isArray(candidate.next) ||
        candidate.auctionDisplay)
    ) {
      return candidate;
    }
    return null;
  }

  function notifyParentAck(revision) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: "NEUD_DISPLAY_BRIDGE_ACK",
            displayId: displayInfo.displayId ?? null,
            projectId: displayInfo.projectId ?? null,
            revision: revision ?? null,
          },
          window.location.origin,
        );
      }
    } catch (_) {}
    debugLog("[NEUD Display] iframe bridge acknowledged");
  }

  function isAllowedMessageOrigin(origin) {
    if (!origin || origin === "null") {
      return true;
    }
    if (origin === window.location.origin) {
      return true;
    }
    return /^https?:\\/\\/(127\\.0\\.0\\.1|localhost)(:\\d+)?$/i.test(origin);
  }

  function postRuntimeUpdate(snapshot, meta) {
    try {
      window.postMessage(
        {
          source: "neud-runtime",
          type: "NEUD_DATA_UPDATE",
          version: 1,
          payload: snapshot,
          revision: meta.revision ?? null,
        },
        window.location.origin,
      );
    } catch (_) {}
  }

  function publishSnapshot(snapshot, meta) {
    if (!window.NEUDDisplay || typeof window.NEUDDisplay._publish !== "function") {
      postRuntimeUpdate(snapshot, meta);
      notifyParentAck(meta.revision ?? null);
      return;
    }
    window.NEUDDisplay._publish(snapshot, meta);
    notifyParentAck(meta.revision ?? null);
    debugLog("[NEUD Display] snapshot update delivered");
  }

  function deliverLatestSnapshot() {
    if (!bridgeReady || latestSnapshot == null) {
      return;
    }
    publishSnapshot(latestSnapshot, {
      ...displayInfo,
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
    debugLog("[NEUD Display] display runtime connected");
    deliverLatestSnapshot();
    if (!runtimeStarted) {
      runtimeStarted = true;
      void publishLatest();
      pollTimer = window.setInterval(publishLatest, pollIntervalMs);
    }
  }

  async function publishLatest() {
    if (window.__NEUD_DISPLAY_DATA_DISCONNECTED__) {
      stopPolling();
      return;
    }

    activeRequest?.abort();
    activeRequest = new AbortController();
    try {
      const response = await fetch(dataUrl, {
        cache: "no-store",
        signal: activeRequest.signal,
        headers: { "X-NEUD-Display-Client": "developer-tools-runtime" },
      });
      if (response.status === 409 || response.status === 423 || response.status === 403) {
        stopPolling();
        return;
      }
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      if (
        payload.enabled === false ||
        payload.status === "display_disabled" ||
        payload.dataConnected === false
      ) {
        stopPolling();
        return;
      }

      const snapshot = resolveCanonicalSnapshot(payload);
      if (!snapshot) {
        return;
      }

      latestSnapshot = snapshot;
      latestRevision = payload.revision ?? null;
      debugLog("[NEUD Display] canonical snapshot resolved");

      if (!bridgeReady) {
        debugLog("[NEUD Display] initial snapshot retained until iframe readiness");
        return;
      }

      publishSnapshot(snapshot, {
        ...displayInfo,
        source: payload.source ?? null,
        revision: latestRevision,
        enabled: payload.enabled !== false,
      });
      if (latestRevision === payload.revision) {
        debugLog("[NEUD Display] initial snapshot delivered");
      }
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
    } finally {
      activeRequest = null;
    }
  }

  window.addEventListener("NEUD_DISPLAY_READY", markBridgeReady);
  window.addEventListener("message", function (event) {
    if (!isAllowedMessageOrigin(event.origin)) {
      return;
    }
    const msg = event.data;
    if (
      msg &&
      typeof msg === "object" &&
      msg.source === "neud-display" &&
      msg.type === "NEUD_DISPLAY_READY"
    ) {
      debugLog("[NEUD Display] display ready handshake received");
      markBridgeReady();
    }
  });
  window.addEventListener("beforeunload", stopPolling);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", markBridgeReady);
  } else {
    markBridgeReady();
  }
})();`;
}
function injectIntoHead(html, injection) {
    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head([^>]*)>/i, `<head$1>\n${injection}`);
    }
    if (/<html[^>]*>/i.test(html)) {
        return html.replace(/<html([^>]*)>/i, `<html$1>\n<head>${injection}</head>`);
    }
    return `${injection}\n${html}`;
}
function buildTransparentOutputShellHtml(input) {
    const viewportWidth = input.viewportWidth ?? 1920;
    const viewportHeight = input.viewportHeight ?? 1080;
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=${viewportWidth}, height=${viewportHeight}, initial-scale=1" />
    <title>NEUD Display Output</title>
    <style>
      html, body {
        width: ${viewportWidth}px;
        height: ${viewportHeight}px;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: transparent !important;
        background-color: transparent !important;
      }
    </style>
  </head>
  <body></body>
</html>`;
}
function wrapStandaloneDisplayHtml(input) {
    const bridgeAlreadyPresent = hasEmbeddedNeudDisplayBridge(input.html);
    const guardAlreadyPresent = /__NEUD_DISPLAY_FETCH_GUARD__/.test(input.html);
    const runtimeAlreadyPresent = hasEmbeddedNeudDisplayRuntime(input.html);
    const configScript = buildDisplayConfigScript({
        dataUrl: input.dataUrl,
        displayInfo: input.displayInfo,
        localApiBase: input.localApiBase ?? "http://127.0.0.1:8070",
        pollIntervalMs: input.pollIntervalMs,
    });
    const outputStyle = input.outputMode
        ? `<style>html,body{margin:0;padding:0;width:${input.viewportWidth ?? 1920}px;height:${input.viewportHeight ?? 1080}px;overflow:hidden;background:transparent!important;background-color:transparent!important;}</style>`
        : "";
    const headInjection = [
        outputStyle,
        guardAlreadyPresent ? "" : `<script>${exports.DISPLAY_FETCH_GUARD_SCRIPT}</script>`,
        bridgeAlreadyPresent ? "" : `<script>${exports.DISPLAY_BRIDGE_SCRIPT}</script>`,
        runtimeAlreadyPresent ? "" : configScript,
        runtimeAlreadyPresent ? "" : `<script src="/neud-display-runtime.js"></script>`,
    ]
        .filter(Boolean)
        .join("\n");
    if (/<\/body>/i.test(input.html)) {
        const withHead = headInjection ? injectIntoHead(input.html, headInjection) : input.html;
        return withHead;
    }
    if (/<\/html>/i.test(input.html)) {
        const withHead = headInjection ? injectIntoHead(input.html, headInjection) : input.html;
        return withHead;
    }
    return buildDisplayDocument({
        html: input.html,
        css: "",
        javascript: "",
        dataUrl: input.dataUrl,
        displayInfo: input.displayInfo,
        viewportWidth: input.viewportWidth,
        viewportHeight: input.viewportHeight,
        localApiBase: input.localApiBase,
        pollIntervalMs: input.pollIntervalMs,
        outputMode: input.outputMode,
    });
}
function buildDisplayConfigScript(input) {
    const config = {
        dataUrl: input.dataUrl,
        displayInfo: input.displayInfo,
        localApiBase: input.localApiBase ?? "http://127.0.0.1:8070",
        debug: input.debug === true,
    };
    if (typeof input.pollIntervalMs === "number" && input.pollIntervalMs >= 250) {
        config.pollIntervalMs = input.pollIntervalMs;
    }
    return `<script>window.__NEUD_DISPLAY_CONFIG__ = ${JSON.stringify(config)};</script>`;
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
