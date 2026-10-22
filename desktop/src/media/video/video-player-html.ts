/**
 * Canvas-based ProRes layer that receives straight BGRA frames over WebSocket
 * and participates in the existing Chromium composite (preview, stack, output).
 */
export function buildVideoPlayerHtml(input: {
  displayId: string;
  projectId: string;
  width: number;
  height: number;
  localApiBase: string;
  loopEnabled: boolean;
}): string {
  const config = JSON.stringify({
    displayId: input.displayId,
    projectId: input.projectId,
    width: input.width,
    height: input.height,
    localApiBase: input.localApiBase.replace(/\/$/, ""),
    loopEnabled: input.loopEnabled,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${input.width}, height=${input.height}, initial-scale=1" />
  <title>NEUD Video Display</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      overflow: hidden;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      background: transparent;
    }
    .status {
      position: absolute;
      left: 16px;
      bottom: 16px;
      padding: 6px 10px;
      border-radius: 6px;
      background: rgba(0,0,0,0.45);
      color: rgba(255,255,255,0.9);
      font: 12px/1.3 system-ui, sans-serif;
      pointer-events: none;
      opacity: 0;
      transition: opacity 160ms ease;
    }
    .status.is-visible { opacity: 1; }
  </style>
</head>
<body>
  <canvas id="stage"></canvas>
  <div class="status" id="status"></div>
  <script>
(function () {
  var CONFIG = ${config};
  var canvas = document.getElementById("stage");
  var statusEl = document.getElementById("status");
  var ctx = canvas.getContext("2d", { alpha: true });
  var imageData = null;
  var socket = null;
  var reconnectTimer = null;
  var statusTimer = null;

  function resize() {
    var w = CONFIG.width || window.innerWidth || 1920;
    var h = CONFIG.height || window.innerHeight || 1080;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      imageData = ctx.createImageData(w, h);
    }
  }

  /** Errors only — never paint routine connect/subscribe status onto broadcast graphics. */
  function showError(text) {
    statusEl.textContent = text || "";
    statusEl.classList.toggle("is-visible", Boolean(text));
    if (statusTimer) clearTimeout(statusTimer);
  }

  function clearError() {
    statusEl.textContent = "";
    statusEl.classList.remove("is-visible");
    if (statusTimer) clearTimeout(statusTimer);
  }

  function bgraToRgba(bgra, rgba, width, height, stride) {
    var row;
    var src;
    var dst;
    var x;
    for (row = 0; row < height; row++) {
      src = row * stride;
      dst = row * width * 4;
      for (x = 0; x < width; x++, src += 4, dst += 4) {
        rgba[dst] = bgra[src + 2];
        rgba[dst + 1] = bgra[src + 1];
        rgba[dst + 2] = bgra[src];
        rgba[dst + 3] = bgra[src + 3];
      }
    }
  }

  function drawFrame(buffer, width, height, stride) {
    resize();
    if (!imageData || imageData.width !== width || imageData.height !== height) {
      imageData = ctx.createImageData(width, height);
      canvas.width = width;
      canvas.height = height;
    }
    var bgra = new Uint8Array(buffer);
    bgraToRgba(bgra, imageData.data, width, height, stride || width * 4);
    ctx.putImageData(imageData, 0, 0);
  }

  function connect() {
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
    var base = CONFIG.localApiBase || (location.protocol + "//" + location.host);
    var wsUrl = base.replace(/^http/, "ws") + "/api/video/frames/" + encodeURIComponent(CONFIG.displayId);
    try {
      socket = new WebSocket(wsUrl);
    } catch (err) {
      console.warn("[neud-video] socket unavailable", err);
      showError("Video socket unavailable");
      scheduleReconnect();
      return;
    }
    socket.binaryType = "arraybuffer";
    socket.onopen = function () {
      // Subscribe quietly — do not overlay routine connect success on preview/pin/output.
      clearError();
      console.info("[neud-video] frame socket open displayId=" + CONFIG.displayId);
      socket.send(JSON.stringify({ type: "subscribe", displayId: CONFIG.displayId }));
    };
    socket.onclose = function () {
      // Reconnect silently; transient reconnect text must not appear on broadcast output.
      console.info("[neud-video] frame socket closed; reconnecting displayId=" + CONFIG.displayId);
      scheduleReconnect();
    };
    socket.onerror = function () {
      console.warn("[neud-video] frame socket error displayId=" + CONFIG.displayId);
      showError("Video socket error");
    };
    socket.onmessage = function (event) {
      if (typeof event.data === "string") {
        try {
          var msg = JSON.parse(event.data);
          // Ignore routine status/session acks (e.g. former "Subscribed" / connect toasts).
          if (msg.type === "error" && msg.error) showError(msg.error);
        } catch (_) {}
        return;
      }
      var bytes = new Uint8Array(event.data);
      if (bytes.byteLength < 24) return;
      var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      var width = view.getUint32(0, true);
      var height = view.getUint32(4, true);
      var stride = view.getUint32(8, true);
      // bytes 12-19 pts (float64), 20-23 reserved
      var payload = bytes.subarray(24);
      drawFrame(payload, width, height, stride);
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, 750);
  }

  resize();
  connect();
  window.addEventListener("resize", resize);
})();
  </script>
</body>
</html>`;
}
