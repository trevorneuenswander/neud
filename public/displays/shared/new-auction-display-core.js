(function (global) {
  "use strict";

  const CANVAS_W = 3840;
  const CANVAS_H = 2160;
  const FADE_MS = 250;
  const PHOTO_CYCLE_MS = 6000;
  const PHOTO_TRANSITION_MS = 650;
  const MARQUEE_V = 40;
  const MARQUEE_EASE_SEC = 1;
  const MARQUEE_PAUSE_MS = 4000;
  const EPS = 0.5;

  const params = new URLSearchParams(global.location.search);
  const DEMO_MODE = params.get("demo") === "1";
  const LAYOUT_GUIDES = params.get("layoutGuides") === "1";
  const PINNED_PREVIEW = params.get("pinnedPreview") === "1";
  const PREVIEW_SAMPLE = Math.min(
    2,
    Math.max(1, +(params.get("previewSample") || global.devicePixelRatio || 1) || 1),
  );
  let pinnedPreviewViewportLayoutW = 0;
  let pinnedPreviewViewportLayoutH = 0;
  const displayConfig = global.__NEUD_DISPLAY_CONFIG__ || {};
  const POLL_MS = Math.max(
    250,
    +(params.get("poll") || displayConfig.pollMs || 1000),
  );
  let ENDPOINT = params.get("src") || displayConfig.endpoint || null;

  if (ENDPOINT) {
    try {
      ENDPOINT = new URL(ENDPOINT, global.location.origin).href;
    } catch (_) {
      /* ignore invalid src */
    }
  }

  const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rafs = new WeakMap();

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function hasBidValue(value) {
    const v = String(value ?? "").trim();
    if (!v || v === "—") return false;
    if (/^\$?\s*0(?:\.00)?$/i.test(v)) return false;
    return /\d/.test(v);
  }

  function isMissing(value) {
    const v = String(value ?? "").trim();
    return !v || v === "—" || v === "-";
  }

  function formatLotLabel(raw) {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed || trimmed === "—") return "Lot —";
    if (/^lot\s+/i.test(trimmed)) return trimmed;
    return `Lot ${trimmed}`;
  }

  function cancelLoop(container) {
    if (rafs.has(container)) {
      global.cancelAnimationFrame(rafs.get(container));
      rafs.delete(container);
    }
  }

  function measureWidth(el) {
    const rect = el.getBoundingClientRect();
    return rect.width || el.scrollWidth || 1e-6;
  }

  function syncPinnedPreviewViewportMeta() {
    if (!PINNED_PREVIEW) {
      return;
    }
    const liveSample = Math.min(
      2,
      Math.max(
        1,
        +(global.devicePixelRatio || PREVIEW_SAMPLE || 1) || 1,
      ),
    );
    const layoutW = Math.max(1, Math.round(CANVAS_W * liveSample));
    const layoutH = Math.max(1, Math.round(CANVAS_H * liveSample));
    if (
      pinnedPreviewViewportLayoutW === layoutW &&
      pinnedPreviewViewportLayoutH === layoutH
    ) {
      return;
    }
    pinnedPreviewViewportLayoutW = layoutW;
    pinnedPreviewViewportLayoutH = layoutH;
    let meta = global.document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = global.document.createElement("meta");
      meta.setAttribute("name", "viewport");
      global.document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      `width=${layoutW}, height=${layoutH}, initial-scale=1`,
    );
  }

  function scaleStage(stageEl) {
    if (PINNED_PREVIEW) {
      syncPinnedPreviewViewportMeta();
    }

    const viewportW = global.innerWidth || CANVAS_W;
    const viewportH = global.innerHeight || CANVAS_H;
    const scale = Math.min(viewportW / CANVAS_W, viewportH / CANVAS_H);
    const offsetX = (viewportW - CANVAS_W * scale) / 2;
    const offsetY = (viewportH - CANVAS_H * scale) / 2;

    if (PINNED_PREVIEW) {
      stageEl.style.transformOrigin = "top left";
      stageEl.style.width = `${CANVAS_W}px`;
      stageEl.style.height = `${CANVAS_H}px`;
      stageEl.style.zoom = "";
      stageEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
      global.__NEUD_PINNED_PREVIEW_SCALE__ = scale;
      return;
    }

    stageEl.style.zoom = "";
    stageEl.style.width = "";
    stageEl.style.height = "";
    stageEl.style.left = "";
    stageEl.style.top = "";
    stageEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }

  function ensureTrack(container) {
    const inner = container.querySelector(".inner");
    if (!inner) return { mode: "single", width: 0 };

    const text = (container.getAttribute("data-title") || inner.textContent || "—").trim() || "—";
    if (container.classList.contains("fade-out")) {
      const w = measureWidth(inner);
      if (w <= container.clientWidth + EPS) return { mode: "single", width: w };
      return { mode: "loop", width: Math.max(w, 1e-6) };
    }

    inner.textContent = text;
    const singleW = measureWidth(inner);
    if (singleW <= container.clientWidth + EPS) {
      inner.setAttribute("data-built", "single");
      inner.style.transform = "translate3d(0,0,0)";
      return { mode: "single", width: singleW };
    }

    const sig = `loop:${text}`;
    if (inner.getAttribute("data-built") !== sig) {
      const gap = "\u00A0\u00A0\u00A0•\u00A0\u00A0\u00A0";
      inner.innerHTML =
        `<span class="copyA">${escapeHTML(text)}</span>` +
        `<span class="gap">${gap}</span>` +
        `<span class="copyB">${escapeHTML(text)}</span>`;
      inner.setAttribute("data-built", sig);
    }

    const copyA = inner.querySelector(".copyA");
    const gap = inner.querySelector(".gap");
    const loopW = (measureWidth(copyA) + measureWidth(gap)) || 1e-6;
    return { mode: "loop", width: loopW };
  }

  function startMarquee(container) {
    cancelLoop(container);
    const inner = container.querySelector(".inner");
    if (!inner) return;

    if (reducedMotion) {
      inner.style.transform = "translate3d(0,0,0)";
      return;
    }

    const track = ensureTrack(container);
    if (track.mode === "single") {
      inner.style.transform = "translate3d(0,0,0)";
      return;
    }

    const a = MARQUEE_V / MARQUEE_EASE_SEC;
    const easeDist = 0.5 * a * MARQUEE_EASE_SEC * MARQUEE_EASE_SEC;
    const cruiseDist = Math.max(0, track.width - 2 * easeDist);
    const cruiseSec = cruiseDist / MARQUEE_V;
    const totalSec = MARQUEE_EASE_SEC + cruiseSec + MARQUEE_EASE_SEC;
    const totalMs = totalSec * 1000;
    let phase = "prepause";
    let t0 = global.performance.now();

    function sAt(ms) {
      const t = ms / 1000;
      if (t <= 0) return 0;
      if (t <= MARQUEE_EASE_SEC) return 0.5 * a * t * t;
      if (t <= MARQUEE_EASE_SEC + cruiseSec) return easeDist + MARQUEE_V * (t - MARQUEE_EASE_SEC);
      if (t <= totalSec) {
        const u = t - (MARQUEE_EASE_SEC + cruiseSec);
        return easeDist + cruiseDist + (MARQUEE_V * u - 0.5 * a * u * u);
      }
      return track.width;
    }

    function tick(now) {
      const id = global.requestAnimationFrame(tick);
      rafs.set(container, id);
      if (phase === "prepause") {
        inner.style.transform = "translate3d(0,0,0)";
        if (now - t0 >= MARQUEE_PAUSE_MS) {
          phase = "scroll";
          t0 = now;
        }
        return;
      }
      const elapsed = now - t0;
      if (elapsed >= totalMs - 0.1) {
        inner.style.transform = "translate3d(0,0,0)";
        phase = "prepause";
        t0 = now;
        return;
      }
      let offsetX = -sAt(elapsed);
      if (PINNED_PREVIEW) {
        const dpr = global.devicePixelRatio || 1;
        offsetX = Math.round(offsetX * dpr) / dpr;
      }
      inner.style.transform = `translate3d(${offsetX}px,0,0)`;
    }

    global.requestAnimationFrame(tick);
  }

  function restartMarqueesInRoot(root) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return;
    }
    root.querySelectorAll(".title-scroll").forEach((container) => {
      cancelLoop(container);
      const inner = container.querySelector(".inner");
      if (inner) {
        inner.style.transform = "translate3d(0,0,0)";
      }
      global.requestAnimationFrame(() => startMarquee(container));
    });
  }

  function transitionText(el, newText) {
    const next = String(newText ?? "").trim() || "—";
    const cur = el.getAttribute("data-text") ?? el.textContent ?? "";
    if (cur === next) return false;

    el.setAttribute("data-text", next);
    if (reducedMotion) {
      el.textContent = next;
      return true;
    }

    el.classList.remove("fade-out", "slide-in-right");
    void el.offsetWidth;
    el.classList.add("fade-out");
    global.setTimeout(() => {
      el.textContent = next;
      el.classList.remove("fade-out", "slide-in-right");
      void el.offsetWidth;
      el.classList.add("slide-in-right");
    }, FADE_MS);
    return true;
  }

  function transitionTitle(container, newTextRaw) {
    const newText = String(newTextRaw ?? "—").trim() || "—";
    const prev = container.getAttribute("data-title") || "";
    if (prev === newText) {
      if (!rafs.has(container)) global.requestAnimationFrame(() => startMarquee(container));
      return false;
    }

    cancelLoop(container);
    const inner = container.querySelector(".inner");
    container.setAttribute("data-title", newText);

    if (reducedMotion) {
      inner.textContent = newText;
      inner.setAttribute("data-built", "");
      return true;
    }

    container.classList.remove("fade-out", "slide-in-right");
    void container.offsetWidth;
    container.classList.add("fade-out");
    global.setTimeout(() => {
      inner.textContent = newText;
      inner.setAttribute("data-built", "");
      inner.style.transform = "translate3d(0,0,0)";
      container.classList.remove("fade-out", "slide-in-right");
      void container.offsetWidth;
      container.classList.add("slide-in-right");
      global.requestAnimationFrame(() => startMarquee(container));
    }, FADE_MS);
    return true;
  }

  function fitTitleFont(titleEl, minPx, maxPx) {
    if (!titleEl) return;
    let size = maxPx;
    titleEl.style.fontSize = `${size}px`;
    while (size > minPx && titleEl.scrollWidth > titleEl.clientWidth) {
      size -= 2;
      titleEl.style.fontSize = `${size}px`;
    }
  }

  function createDemoPayload() {
    return {
      source: "webpage-scraper",
      enabled: true,
      status: "ok",
      current: {
        lot: "Lot 999",
        year: "1967",
        title: "1967 Ferrari 275 GTB/4 by Scaglietti",
        reserveStatus: "Offered Without Reserve",
        biddingPrice: "$44,000,000",
        primaryCurrency: "USD",
        currencies: {
          EUR: "38,635,520",
          GBP: "33,456,000",
          CHF: "36,960,000",
          JPY: "6,512,000,000",
        },
        photos: [],
        pipSource: null,
      },
      next: [
        { lot: "Lot 1000", title: "1955 Mercedes-Benz 300 SL Gullwing" },
        { lot: "Lot 1001", title: "1973 Porsche 911 Carrera RS 2.7 Touring" },
        { lot: "Lot 1002", title: "1938 Bugatti Type 57C Atalante" },
      ],
    };
  }

  function showDisplayOffPage() {
    global.document.body.innerHTML =
      '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;color:#fff;background:rgba(5,8,13,0.85);font-size:42px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;opacity:0.85;">Display Off</div>';
  }

  function createPoller(onPayload, options) {
    const onDisabled = options && options.onDisabled;
    const displayId =
      (displayConfig && displayConfig.displayId) ||
      (ENDPOINT && String(ENDPOINT).includes("new-ticker") ? "new-ticker-v1" : "new-bid-display-v1");

    if (global.NEUDDisplayConnection && ENDPOINT) {
      let poller;
      const displayInfo =
        displayConfig.displayInfo && typeof displayConfig.displayInfo === "object"
          ? displayConfig.displayInfo
          : {};
      poller = global.NEUDDisplayConnection.createDisplayDataPoller({
        displayId,
        dataUrl: ENDPOINT,
        pollMs: POLL_MS,
        projectId: displayInfo.projectId,
        localApiBase: displayConfig.localApiBase,
        displayBridgeEventsUrl: displayConfig.displayBridgeEventsUrl,
        onPayload: (json, revision) => onPayload(json, revision),
        onDisconnected: () => {
          poller.stopPolling();
          if (typeof onDisabled === "function") {
            onDisabled();
          } else {
            showDisplayOffPage();
          }
        },
      });
      return poller;
    }

    let isPolling = false;
    let inFlight = false;
    let pollTimer = null;
    let lastPayload = null;
    let activeRequest = null;

    function stopPolling() {
      isPolling = false;
      inFlight = false;
      if (pollTimer !== null) {
        global.clearInterval(pollTimer);
        pollTimer = null;
      }
      activeRequest?.abort();
      activeRequest = null;
    }

    async function pollOnce() {
      if (!isPolling || inFlight) return;
      if (DEMO_MODE) {
        onPayload(createDemoPayload(), 0);
        return;
      }
      if (!ENDPOINT) {
        console.warn("[display] Missing ?src= endpoint");
        return;
      }

      inFlight = true;
      activeRequest?.abort();
      activeRequest = new AbortController();
      const signal = activeRequest.signal;

      try {
        const url = ENDPOINT + (ENDPOINT.includes("?") ? "&" : "?") + "_=" + Date.now();
        const response = await fetch(url, { cache: "no-store", signal });
        if (!isPolling) return;
        if (response.status === 409 || response.status === 423) {
          stopPolling();
          if (typeof onDisabled === "function") onDisabled();
          return;
        }
        if (!response.ok) throw new Error("HTTP " + response.status);
        const json = await response.json();
        if (
          json.enabled === false ||
          json.status === "display_disabled" ||
          json.dataConnected === false
        ) {
          stopPolling();
          if (typeof onDisabled === "function") onDisabled();
          return;
        }
        lastPayload = json;
        onPayload(json, json.revision ?? 0);
      } catch (error) {
        if (error && error.name === "AbortError") return;
        if (isPolling && lastPayload) {
          onPayload(lastPayload, lastPayload.revision ?? 0);
        }
        if (isPolling) {
          console.warn("[display] feed unavailable:", error instanceof Error ? error.message : error);
        }
      } finally {
        inFlight = false;
      }
    }

    function startPolling() {
      stopPolling();
      isPolling = true;
      void pollOnce();
      pollTimer = global.setInterval(() => void pollOnce(), POLL_MS);
    }

    function start() {
      startPolling();
    }

    function stop() {
      stopPolling();
    }

    global.addEventListener("beforeunload", stop);
    return { start, stop, stopPolling, getLastPayload: () => lastPayload };
  }

  global.NEUDAuctionDisplayCore = {
    CANVAS_W,
    CANVAS_H,
    FADE_MS,
    PHOTO_CYCLE_MS,
    PHOTO_TRANSITION_MS,
    DEMO_MODE,
    LAYOUT_GUIDES,
    PINNED_PREVIEW,
    PREVIEW_SAMPLE,
    reducedMotion,
    escapeHTML,
    hasBidValue,
    isMissing,
    formatLotLabel,
    cancelLoop,
    scaleStage,
    restartMarqueesInRoot,
    startMarquee,
    transitionText,
    transitionTitle,
    fitTitleFont,
    createDemoPayload,
    createPoller,
    showDisplayOffPage,
  };
})(window);
