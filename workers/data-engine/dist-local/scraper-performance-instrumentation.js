import fs from "fs";
import path from "path";
import { NEUD_APP_DATA_DIR } from "./neud-env.js";

const SENSITIVE_QUERY_KEYS = /^(token|auth|session|password|code|sig|key)$/i;

export function isScraperPerformanceCaptureEnabled() {
  return process.env.NEUD_SCRAPER_PERFORMANCE_CAPTURE === "1";
}

export function sanitizeUrlForDiagnostics(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return null;
  }
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return `${url.origin}${url.pathname}${url.search ? url.search : ""}`;
  } catch {
    return rawUrl.split("?")[0]?.slice(0, 200) ?? null;
  }
}

function classifyResourceCategory(url, resourceType, contentType) {
  const normalized = (url ?? "").toLowerCase();
  const type = (resourceType ?? "").toLowerCase();
  const mime = (contentType ?? "").toLowerCase();

  if (type === "websocket" || normalized.startsWith("ws:") || normalized.startsWith("wss:")) {
    return "websocket";
  }
  if (mime.includes("text/event-stream") || type === "eventsource") {
    return "eventsource";
  }
  if (normalized.includes("faye.auctionaccelerate.com/faye")) {
    if (/meta%2Fhandshake|"handshake"/i.test(normalized)) {
      return "Faye/Bayeux handshake";
    }
    if (/meta%2Fsubscribe|"subscribe"/i.test(normalized)) {
      return "Faye/Bayeux subscribe";
    }
    if (/meta%2Fconnect|"connect"/i.test(normalized)) {
      return "Faye/Bayeux long-polling";
    }
    if (/jsonp=/.test(normalized) || /callback=/.test(normalized)) {
      return "Faye/Bayeux JSONP";
    }
    return "Faye/Bayeux";
  }
  if (type === "document") {
    return "document";
  }
  if (type === "stylesheet") {
    return "stylesheet";
  }
  if (type === "image") {
    return "image";
  }
  if (type === "font") {
    return "font";
  }
  if (type === "script") {
    return "script";
  }
  if (type === "xhr" || type === "fetch") {
    if (/\/graphql/.test(normalized)) {
      return "GraphQL";
    }
    return "xhr";
  }
  if (/\/auctions/.test(normalized) && !/\/vehicles/.test(normalized)) {
    return "Bid Display document";
  }
  if (/\/vehicles/.test(normalized)) {
    return normalized.includes("/edit")
      ? "Vehicle Detail"
      : "Auction Table / Vehicle List";
  }
  if (/\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/.test(normalized)) {
    return "image";
  }
  if (/analytics|google-analytics|segment|hotjar|sentry/.test(normalized)) {
    return "analytics/unrelated assets";
  }
  return "other";
}

let activeRecorder = null;
const cycleHistory = [];

export class ScraperPerformanceRecorder {
  constructor() {
    this.resetCycle();
    this.networkEvents = [];
    this.networkAttached = false;
  }

  resetCycle() {
    this.cycle = {
      cycleId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cycleScheduledAt: null,
      cycleStartedAt: null,
      cycleCompletedAt: null,
      configuredPollIntervalMs: null,
      stages: {},
      scheduler: {},
      network: {
        requests: [],
        websocketUrls: [],
        sseUrls: [],
      },
      extractionSources: {
        currentLot: "DOM (.lot-number .value on Bid Display page)",
        currentLotTitle: "DOM (vehicle-name data-bind on Bid Display page)",
        currentBid: "DOM (.current_price on Bid Display page)",
        currencyConversions: "DOM (.other-currency .price on Bid Display page)",
      },
    };
  }

  beginCycle(input = {}) {
    this.resetCycle();
    this.cycle.cycleScheduledAt = input.cycleScheduledAt ?? new Date().toISOString();
    this.cycle.cycleStartedAt = new Date().toISOString();
    this.cycle.configuredPollIntervalMs = input.configuredPollIntervalMs ?? null;
    activeRecorder = this;
  }

  markStage(stage, durationMs, extra = {}) {
    if (!this.cycle.stages[stage]) {
      this.cycle.stages[stage] = { durationMs, ...extra };
    } else {
      this.cycle.stages[stage].durationMs =
        (this.cycle.stages[stage].durationMs ?? 0) + durationMs;
      Object.assign(this.cycle.stages[stage], extra);
    }
  }

  setSchedulerMetrics(metrics) {
    this.cycle.scheduler = { ...this.cycle.scheduler, ...metrics };
  }

  attachNetworkMonitoring(page) {
    if (this.networkAttached || !page) {
      return;
    }
    this.networkAttached = true;

    const onRequest = (request) => {
      const url = sanitizeUrlForDiagnostics(request.url());
      if (!url) return;
      const resourceType = request.resourceType();
      this.networkEvents.push({
        phase: "request",
        method: request.method(),
        urlPattern: url,
        resourceType,
        category: classifyResourceCategory(url, resourceType, null),
        at: Date.now(),
      });
    };

    const onResponse = async (response) => {
      const request = response.request();
      const url = sanitizeUrlForDiagnostics(response.url());
      if (!url) return;
      const resourceType = request.resourceType();
      const timing = response.timing?.()?.receiveHeadersEnd ?? null;
      let contentType = null;
      try {
        contentType = response.headers()?.["content-type"] ?? null;
      } catch {
        contentType = null;
      }
      this.networkEvents.push({
        phase: "response",
        method: request.method(),
        urlPattern: url,
        resourceType,
        category: classifyResourceCategory(url, resourceType, null),
        status: response.status(),
        contentType: contentType ? String(contentType).split(";")[0] : null,
        durationMs:
          typeof timing === "number" && Number.isFinite(timing) ? Math.round(timing) : null,
        at: Date.now(),
      });
    };

    page.on("request", onRequest);
    page.on("response", onResponse);
  }

  finalizeCycle(extra = {}) {
    this.cycle.cycleCompletedAt = new Date().toISOString();
    const started = Date.parse(this.cycle.cycleStartedAt ?? "");
    const completed = Date.parse(this.cycle.cycleCompletedAt ?? "");
    const totalCycleMs =
      Number.isFinite(started) && Number.isFinite(completed)
        ? Math.max(0, completed - started)
        : null;

    const summarizedRequests = summarizeNetworkEvents(this.networkEvents);
    this.cycle.network = summarizedRequests;
    this.cycle.totalCycleMs = totalCycleMs;
    Object.assign(this.cycle, extra);

    cycleHistory.push({ ...this.cycle });
    if (cycleHistory.length > 20) {
      cycleHistory.shift();
    }

    if (isScraperPerformanceCaptureEnabled()) {
      writePerformanceArtifact({
        lastCycle: this.cycle,
        recentCycles: cycleHistory.map((entry) => ({
          cycleId: entry.cycleId,
          totalCycleMs: entry.totalCycleMs,
          stages: entry.stages,
          scheduler: entry.scheduler,
        })),
      });
    }

    activeRecorder = null;
    this.networkAttached = false;
    this.networkEvents = [];
    return this.cycle;
  }
}

function summarizeNetworkEvents(events) {
  const byKey = new Map();
  const websocketUrls = new Set();
  const eventsourceUrls = new Set();
  const fayeUrls = new Set();

  for (const event of events) {
    if (event.resourceType === "websocket" || event.category === "websocket") {
      websocketUrls.add(event.urlPattern);
    }
    if (event.category === "eventsource") {
      eventsourceUrls.add(event.urlPattern);
    }
    if (String(event.category ?? "").startsWith("Faye/Bayeux")) {
      fayeUrls.add(event.urlPattern);
    }
    const key = `${event.method}:${event.urlPattern}:${event.resourceType}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        method: event.method,
        urlPattern: event.urlPattern,
        resourceType: event.resourceType,
        category: event.category,
        status: event.status ?? null,
        contentType: event.contentType ?? null,
        sampleCount: 1,
        durationMs: event.durationMs ?? null,
      });
    } else {
      existing.sampleCount += 1;
      if (event.durationMs != null) {
        existing.durationMs = event.durationMs;
      }
      if (event.status != null) {
        existing.status = event.status;
      }
    }
  }

  return {
    requests: [...byKey.values()].slice(0, 120),
    websocketUrls: [...websocketUrls],
    eventsourceUrls: [...eventsourceUrls],
    fayeUrls: [...fayeUrls],
    livePushTransportFound:
      websocketUrls.size > 0 || eventsourceUrls.size > 0 || fayeUrls.size > 0,
  };
}

export function getActiveScraperPerformanceRecorder() {
  return activeRecorder;
}

export function createScraperPerformanceRecorder() {
  return new ScraperPerformanceRecorder();
}

export function writePerformanceArtifact(payload) {
  const root = NEUD_APP_DATA_DIR()?.trim();
  if (!root) {
    return null;
  }
  const dir = path.join(root, "diagnostics");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "scraper-performance-latest.json");
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return target;
}

export function readPerformanceArtifact() {
  const root = NEUD_APP_DATA_DIR()?.trim();
  if (!root) {
    return null;
  }
  const target = path.join(root, "diagnostics", "scraper-performance-latest.json");
  if (!fs.existsSync(target)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {
    return null;
  }
}

export function summarizeCycleTimings(cycles) {
  const totals = cycles
    .map((entry) => entry.totalCycleMs)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  if (totals.length === 0) {
    return null;
  }
  const sorted = [...totals].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)] ?? null;
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    sampleCount: sorted.length,
    minCycleMs: sorted[0] ?? null,
    medianCycleMs: median,
    p95CycleMs: sorted[p95Index] ?? null,
    maxCycleMs: sorted[sorted.length - 1] ?? null,
  };
}
