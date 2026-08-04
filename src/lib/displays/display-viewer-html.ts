export const DISPLAY_FETCH_GUARD_SCRIPT = `<script>
(function () {
  if (window.__NEUD_DISPLAY_FETCH_GUARD__) return;
  window.__NEUD_DISPLAY_FETCH_GUARD__ = true;

  function forceStopDisplayPolling() {
    window.__NEUD_DISPLAY_DATA_DISCONNECTED__ = true;
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
      window.setTimeout(function () {
        window.location.reload();
      }, 0);
    }
    return response;
  };

  window.addEventListener("neud-display-connection-changed", function (event) {
    var detail = event.detail || {};
    if (detail.enabled === false || detail.dataConnected === false) {
      forceStopDisplayPolling();
    }
  });

  function handleDisplayConnectionMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    var config = window.__NEUD_DISPLAY_CONFIG__ || {};
    var displayId = config.displayId;
    if (!displayId || payload.displayId !== displayId) return;

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
      window.setTimeout(function () {
        window.location.reload();
      }, 0);
    }
  }

  try {
    var guardChannel = new BroadcastChannel("neud-display-connection");
    guardChannel.onmessage = function (event) {
      handleDisplayConnectionMessage(event.data);
    };
  } catch (_) {}
})();
</script>`;

export function injectDisplayFetchGuard(html: string): string {
  if (html.includes("__NEUD_DISPLAY_FETCH_GUARD__")) {
    return html;
  }

  if (html.includes("<head>")) {
    return html.replace("<head>", `<head>\n${DISPLAY_FETCH_GUARD_SCRIPT}`);
  }

  return `${DISPLAY_FETCH_GUARD_SCRIPT}\n${html}`;
}
