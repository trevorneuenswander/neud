/** Static Broad Arrow scraper pipeline map (code-derived, diagnostic-only). */

export const BAG_REFERENCE_URLS = {
  vehicleList: "https://bagauction-jumbotron.auctionaccelerate.com/vehicles",
  login: "https://bagauction-jumbotron.auctionaccelerate.com/users/sign_in",
  bidDisplay: "https://bagauction-jumbotron.auctionaccelerate.com/auctions",
  vehicleDetailPattern: "/vehicles/{id}/edit",
};

export const PIPELINE_STAGES = [
  {
    id: "poll_timer",
    label: "Engine loop schedules scrape",
    frequency: "every poll (after prior cycle completes + waitUntilNextPoll)",
    module: "workers/data-engine/src/engine-runtime.js",
  },
  {
    id: "adapter_scrape_once",
    label: "bag-auction adapter scrapeOnce",
    frequency: "every poll",
    module: "workers/data-engine/src/adapters/bag-auction.js",
  },
  {
    id: "vehicle_list_reload",
    label: "Listing page reload (networkidle2) + table DOM parse",
    frequency: "every poll",
    module: "workers/data-engine/src/adapters/bag-auction-legacy-runtime.js",
  },
  {
    id: "last_sold_detail_checks",
    label: "Vehicle edit pages for sold-state (up to max_detail_checks_per_poll)",
    frequency: "every poll (TTL/cache may skip)",
    module: "bag-auction-legacy-runtime.js + bag-lot-detail-page.js",
  },
  {
    id: "bid_display_goto",
    label: "Bid Display navigation (networkidle2) + DOM extract",
    frequency: "every poll",
    module: "bag-auction-legacy-runtime.js scrapeAuctionDisplayPage",
  },
  {
    id: "snapshot_write",
    label: "Worker POST snapshot to desktop local API",
    frequency: "every poll",
    module: "workers/data-engine/src/local-client.js writeSnapshot",
  },
  {
    id: "desktop_ingest",
    label: "Desktop SQLite + BAG live state + display notification",
    frequency: "every poll (async on desktop)",
    module: "desktop local data / bag live state services",
  },
];

export const SCHEDULER_MODEL = {
  schedulerModel: "fixed-interval-after-cycle-completion",
  pollOverlapAllowed: false,
  pollQueuedWhileBusy: false,
  pollSkippedWhileBusy: false,
  description:
    "waitUntilNextPoll(pollCompletedAt, pollIntervalMs) sleeps until pollCompletedAt + interval. The 2.5s timer starts AFTER the scrape finishes, not when it starts.",
  expectedEffectiveUpdateMsFormula: "scrapeDurationMs + configuredPollIntervalMs",
};

export const LIVE_FIELD_SOURCES = {
  currentLotNumber: {
    currentSource: "DOM (.lot-number .value) on Bid Display page",
    networkSourceAvailable: "unknown until live network probe",
  },
  currentLotTitle: {
    currentSource: "DOM (vehicle-name data-bind) on Bid Display page",
    networkSourceAvailable: "unknown until live network probe",
  },
  currentBid: {
    currentSource: "DOM (.current_price) on Bid Display page",
    networkSourceAvailable: "unknown until live network probe",
  },
  currencyConversions: {
    currentSource: "DOM (.other-currency .price) on Bid Display page",
    networkSourceAvailable: "unknown until live network probe",
  },
};

export const VEHICLE_LIST_DEPENDENCIES = [
  { field: "prev/current/next lot rows", class: "LOT_TRANSITION", note: "Stream Ticker next 3 lots" },
  { field: "active row detection", class: "LIVE REQUIRED", note: "Fallback when display page stale" },
  { field: "lastSold scan order", class: "BACKGROUND", note: "Drives detail page visits" },
  { field: "full lots[] array in snapshot", class: "BACKGROUND", note: "Catalog + controller" },
  { field: "editHref for detail fetches", class: "ON_LOT_CHANGE / BACKGROUND", note: "Sold checks" },
];

export const DETAIL_PAGE_FIELDS = [
  { field: "sold (#vehicle_sold)", class: "BACKGROUND", feeds: "lastSold" },
  { field: "reserve flags/price", class: "ON_LOT_CHANGE", feeds: "export + cache, not live bid display" },
  { field: "photo URLs", class: "PRELOAD_ONCE", feeds: "export/download, not live bid path" },
  { field: "currentPrice on detail", class: "BACKGROUND", feeds: "lastSold price fallback" },
];

export const CACHEABILITY_MATRIX = [
  { field: "currentLotNumber", volatility: "A. SUB_SECOND" },
  { field: "currentLotTitle", volatility: "B. LOT_TRANSITION" },
  { field: "currentBid", volatility: "A. SUB_SECOND" },
  { field: "currencyConversions", volatility: "A. SUB_SECOND" },
  { field: "nextLots", volatility: "B. LOT_TRANSITION" },
  { field: "reserveStatus", volatility: "B. LOT_TRANSITION" },
  { field: "photos", volatility: "D. STATIC" },
  { field: "soldStatus", volatility: "B. LOT_TRANSITION" },
  { field: "vehicleName", volatility: "B. LOT_TRANSITION" },
  { field: "vehicleMetadata", volatility: "D. STATIC" },
  { field: "auctionDay", volatility: "C. PERIODIC" },
];

export const BROWSER_LIFECYCLE = {
  chromeLaunchesPerSession: "once per engine start (boot)",
  pagesCreatedPerPoll: 0,
  persistentPages: ["listing page", "detail page", "auction display page"],
  navigationsPerPoll: [
    "listing page reload",
    "0..max_detail_checks_per_poll detail navigations",
    "auction display goto",
  ],
  loginChecksPerPoll: "only if redirected to /users/sign_in",
  loginSubmissionsPerSession: "once at boot (unless session lost)",
};

export const ARCHITECTURE_OPTIONS_RANKED = [
  {
    option: "C. Persistent page + network response interception",
    latency: "high potential",
    reliability: "medium-high",
    complexity: "medium",
    siteChangeResilience: "medium",
  },
  {
    option: "B. Direct authenticated XHR/fetch endpoint",
    latency: "high potential",
    reliability: "high if stable API",
    complexity: "medium-low",
    siteChangeResilience: "low-medium",
  },
  {
    option: "D. Persistent page + MutationObserver",
    latency: "medium-high",
    reliability: "medium",
    complexity: "low-medium",
    siteChangeResilience: "medium",
  },
  {
    option: "A. Direct WebSocket/SSE consumption",
    latency: "best if channel exists",
    reliability: "depends on vendor push",
    complexity: "medium-high",
    siteChangeResilience: "low",
  },
  {
    option: "F. Optimized navigation scraper (current path)",
    latency: "lowest today but bounded by networkidle2 + multi-page",
    reliability: "proven",
    complexity: "already shipped",
    siteChangeResilience: "high",
  },
];
