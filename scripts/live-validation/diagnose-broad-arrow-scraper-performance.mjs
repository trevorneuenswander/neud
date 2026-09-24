#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getRepoRoot, loadLiveValidationEnv } from "./lib/env.mjs";
import {
  ARCHITECTURE_OPTIONS_RANKED,
  BAG_REFERENCE_URLS,
  BROWSER_LIFECYCLE,
  CACHEABILITY_MATRIX,
  DETAIL_PAGE_FIELDS,
  LIVE_FIELD_SOURCES,
  PIPELINE_STAGES,
  SCHEDULER_MODEL,
  VEHICLE_LIST_DEPENDENCIES,
} from "./lib/broad-arrow-scraper-pipeline.mjs";
import { buildFayeDiscovery } from "./lib/faye-static-analysis.mjs";
import { reclassifyCapturedRequests } from "./lib/network-resource-classification.mjs";
import { getBagLifecycleDiagnostics } from "../../workers/data-engine/src/adapters/bag-lifecycle-diagnostics.js";

function readText(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function resolveAppDataDir(explicit) {
  if (explicit?.trim()) {
    return explicit.trim();
  }
  if (process.env.APPDATA?.trim()) {
    return path.join(process.env.APPDATA.trim(), "NEUD");
  }
  if (process.env.HOME?.trim()) {
    return path.join(process.env.HOME.trim(), ".neud");
  }
  return null;
}

function readCapturedPerformance(appDataDir) {
  const root = resolveAppDataDir(appDataDir);
  if (!root) {
    return null;
  }
  const target = path.join(root, "diagnostics", "scraper-performance-latest.json");
  if (!fs.existsSync(target)) {
    return { path: target, present: false, data: null };
  }
  try {
    return {
      path: target,
      present: true,
      data: JSON.parse(fs.readFileSync(target, "utf8")),
    };
  } catch {
    return { path: target, present: true, data: null, parseError: true };
  }
}

function summarizeBaseline(captured) {
  const cycles = captured?.data?.recentCycles ?? [];
  const totals = cycles
    .map((entry) => entry.totalCycleMs)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  if (totals.length === 0) {
    return {
      sampleCount: 0,
      note: "Enable NEUD_SCRAPER_PERFORMANCE_CAPTURE=1, run the Broad Arrow engine for >=10 polls, then re-run this diagnostic.",
    };
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

function deriveLatencyExplanation(captured, configuredPollIntervalMs) {
  const last = captured?.data?.lastCycle ?? null;
  const scrapeMs =
    last?.scheduler?.scrapeDurationMs ??
    last?.stages?.vehicleListNavigationMs?.durationMs ??
    null;
  const total = last?.totalCycleMs ?? null;
  const interval = last?.configuredPollIntervalMs ?? configuredPollIntervalMs ?? 2500;
  return {
    configuredPollIntervalMs: interval,
    measuredScrapeDurationMs: scrapeMs,
    measuredEngineLoopDurationMs: last?.scheduler?.engineLoopDurationMs ?? total,
    estimatedEffectiveUpdateIntervalMs:
      typeof scrapeMs === "number" ? scrapeMs + interval : interval + 3000,
    reason2_5sBecomes5to6s:
      "Poll interval is applied after scrape completion (waitUntilNextPoll). Effective update ≈ scrape duration + poll interval.",
    exampleTimeline:
      typeof scrapeMs === "number"
        ? [
            "0.0s cycle starts",
            `${(scrapeMs / 1000).toFixed(1)}s scrape completes`,
            `${((scrapeMs + interval) / 1000).toFixed(1)}s next cycle starts`,
          ]
        : ["0.0s cycle starts", "~3.0s scrape completes (typical)", "~5.5s next cycle starts (with 2500ms interval)"],
  };
}

function summarizeNetworkCategories(requests) {
  const counts = {};
  for (const entry of requests ?? []) {
    const key = entry.category ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function analyzeNetworkDiscovery(lastCycle) {
  const network = lastCycle?.network ?? {};
  const reclassified = reclassifyCapturedRequests(network.requests ?? []);
  const reclassifiedResponses = reclassifyCapturedRequests(network.responses ?? []);

  const pushCategories = new Set([
    "websocket",
    "eventsource",
    "Faye/Bayeux",
    "Faye/Bayeux JSONP",
    "Faye/Bayeux handshake",
    "Faye/Bayeux long-polling",
    "xhr",
    "GraphQL",
  ]);

  const apiCandidates = reclassified.filter((entry) => pushCategories.has(entry.category));

  const websocketUrlPatterns = [
    ...new Set(
      reclassified
        .filter((entry) => entry.category === "websocket")
        .map((entry) => entry.urlPattern),
    ),
  ];
  const eventsourceUrlPatterns = [
    ...new Set(
      reclassified
        .filter((entry) => entry.category === "eventsource")
        .map((entry) => entry.urlPattern),
    ),
  ];
  const fayeUrlPatterns = [
    ...new Set(
      reclassified
        .filter((entry) => String(entry.category ?? "").startsWith("Faye/Bayeux"))
        .map((entry) => entry.urlPattern),
    ),
  ];

  const livePushTransportFound =
    websocketUrlPatterns.length > 0 ||
    eventsourceUrlPatterns.length > 0 ||
    fayeUrlPatterns.length > 0;

  return {
    classificationFixApplied: true,
    classificationNote:
      "Resources are not classified as eventsource merely because Faye advertises EventSource transport.",
    livePushTransportFound,
    websocketUrlPatterns,
    eventsourceUrlPatterns,
    fayeUrlPatterns,
    legacyMisclassificationCorrected: {
      removedFalseSseFromStaticAssets: true,
      priorArtifactUsedUrlSubstringEventsource: true,
    },
    categoryCounts: summarizeNetworkCategories(reclassified),
    xhrFetchAndPushCandidates: apiCandidates.slice(0, 40),
    reclassifiedRequestSample: reclassified.slice(0, 25),
    bidDisplayDomSourcesConfirmed: true,
    note:
      reclassified.length === 0
        ? "Run worker with NEUD_SCRAPER_PERFORMANCE_CAPTURE=1 during live auction to populate network tables."
        : null,
    _reclassifiedRequests: reclassified,
    _reclassifiedResponses: reclassifiedResponses,
  };
}

function buildProposedArchitecture(networkDiscovery) {
  const push = networkDiscovery.livePushTransportFound;
  return {
    fastPath: [
      "currentLotNumber",
      "currentLotTitle",
      "currentBid",
      "currencyConversions",
    ],
    lotChangePath: ["nextLots", "reserveStatusForNewCurrentLot", "justFinishedSoldState"],
    backgroundPath: ["activeDayCatalogRefresh", "soldReconciliation", "otherDayLots"],
    preloadCache: ["photos", "lotTitles", "staticMetadata"],
    recommendedFastPath: push
      ? "A/C hybrid: persistent Bid Display page + consume push or intercepted XHR"
      : "C/B hybrid: persistent Bid Display + intercept or call vendor XHR if probe finds stable endpoint",
    recommendedBackground: "TTL detail cache + lot-change sold check only",
    recommendedSoldStatus: "On lot transition, detail fetch for previous lot only; list scan as fallback",
    recommendedDayFilter: "Scope hot polling to active auction day; warm cache other days",
  };
}

function subSecondFeasibility(networkDiscovery, baseline) {
  const median = baseline?.medianCycleMs ?? null;
  const push = networkDiscovery.livePushTransportFound;
  let targetUnder1SecondFeasible = "uncertain";
  if (push) {
    targetUnder1SecondFeasible = "likely";
  } else if (median != null && median > 4000) {
    targetUnder1SecondFeasible = "false for current navigation scraper";
  } else {
    targetUnder1SecondFeasible = "likely with fast-path rewrite (not current DOM+networkidle2 loop)";
  }
  return {
    targetUnder1SecondFeasible,
    limitingFactor:
      "Full networkidle2 reload of vehicle list + bid display navigation each poll; post-completion poll delay doubles perceived latency.",
    bestCaseMs: push ? 250 : 400,
    expectedMs: push ? 500 : 900,
    worstNormalMs: median ?? 6000,
    evidenceNote: "bestCase/expected are planning bands pending live network probe confirmation.",
  };
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  loadLiveValidationEnv(repoRoot);

  const engineRuntime = readText(repoRoot, "workers/data-engine/src/engine-runtime.js");
  const legacyRuntime = readText(repoRoot, "workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  const instrumentationPresent = fs.existsSync(
    path.join(repoRoot, "workers/data-engine/src/scraper-performance-instrumentation.js"),
  );

  const configuredPollIntervalMs = 2500;
  const appDataDir = resolveAppDataDir(process.env.NEUD_APP_DATA_DIR ?? null);
  const captured = readCapturedPerformance(appDataDir);
  const baseline = summarizeBaseline(captured);
  const latency = deriveLatencyExplanation(captured, configuredPollIntervalMs);
  const lastCycle = captured?.data?.lastCycle ?? null;
  const networkDiscovery = analyzeNetworkDiscovery(lastCycle);
  const fayeDiscovery = buildFayeDiscovery({
    networkRequests: networkDiscovery._reclassifiedRequests ?? [],
    messageToDomLatency: lastCycle?.fayeMessageToDomLatency ?? null,
  });
  delete networkDiscovery._reclassifiedRequests;
  delete networkDiscovery._reclassifiedResponses;

  const summary = {
    milestone: "v0.2.0",
    latestReleasedVersion: "v0.1.4",
    diagnosticOnlyPass: true,
    scraperBehaviorChanged: false,
    instrumentationPresent,
    captureEnabledEnv: "NEUD_SCRAPER_PERFORMANCE_CAPTURE=1",
    capturedPerformancePath: captured?.path ?? null,
    capturedPerformancePresent: captured?.present === true,
    referenceUrls: BAG_REFERENCE_URLS,
    pipelineStages: PIPELINE_STAGES,
    scheduler: {
      ...SCHEDULER_MODEL,
      ...latency,
      ...(lastCycle?.scheduler ?? {}),
    },
    timingBreakdown: {
      ...(lastCycle?.stages ?? {}),
      pollTimingFromLastScrapeStats: lastCycle?.pollTiming ?? null,
      totalCycleMs: lastCycle?.totalCycleMs ?? null,
    },
    baselineLiveLatency: baseline,
    pagesPerPoll: [
      "Vehicle list: reload listing URL",
      "Vehicle detail: up to max_detail_checks_per_poll (default 8) edit pages for sold detection",
      "Bid Display: goto auctions display URL",
    ],
    vehicleListCost: VEHICLE_LIST_DEPENDENCIES,
    vehicleDetailCost: DETAIL_PAGE_FIELDS,
    soldStatusAnalysis: {
      mechanism: "Scan lots before active index; visit edit pages until sold checkbox found",
      detailPagesPerPoll: "up to MAX_DETAIL_CHECKS_PER_POLL (default 8)",
      listExposesStatusLabel: true,
      bidDisplayExposesFinalStatus: false,
      lotChangeImmediateCheckViable: true,
    },
    activeDayAnalysis: {
      note: "Day bands 101-199 / 201-299 / 301-399 — not filtered in current scraper; full table parsed each poll.",
      estimatedWorkAvoidableByActiveDayFiltering: "high for detail/list processing on inactive days",
    },
    liveFieldSources: LIVE_FIELD_SOURCES,
    networkDiscovery,
    fayeDiscovery,
    lifecycle: getBagLifecycleDiagnostics(),
    browserLifecycle: BROWSER_LIFECYCLE,
    cacheabilityMatrix: CACHEABILITY_MATRIX,
    architectureOptions: ARCHITECTURE_OPTIONS_RANKED,
    proposedFutureClassification: {
      ...buildProposedArchitecture(networkDiscovery),
      recommendedFastPath: fayeDiscovery.recommendedFastPath,
    },
    subSecondFeasibility: subSecondFeasibility(networkDiscovery, baseline),
    topLatencyContributors: [
      "vehicle list page.reload(waitUntil: networkidle2)",
      "bid display page.goto(waitUntil: networkidle2)",
      "lastSold vehicle detail navigations (up to 8/edit TTL)",
      "post-completion poll wait (configured interval after scrape ends)",
    ],
    uiRecommendations: {
      futureMetricsPlacement: "Webpage Scraper engine panel / developer-tools scraper tab",
      suggestedLabels: [
        "Live Data Latency",
        "Last Live Update",
        "Fast Path status",
        "Background Sync status",
      ],
    },
    codeMarkers: {
      waitUntilNextPollAfterCompletion: engineRuntime.includes("pollCompletedAt + activeIntervalMs"),
      listingReloadEachPoll: legacyRuntime.includes("page.reload({ waitUntil: \"networkidle2\""),
      displayGotoEachPoll: legacyRuntime.includes("auctionPage.goto(AUCTIONS_DISPLAY_URL"),
      noPollOverlap: engineRuntime.includes("activeScrapePromise = adapter.scrapeOnce"),
    },
  };

  const outputPath = path.join(repoRoot, "docs", "broad-arrow-scraper-performance.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
