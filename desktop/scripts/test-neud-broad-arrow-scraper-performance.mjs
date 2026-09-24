#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("scraper performance instrumentation is passive and gated", () => {
  const instrumentation = read("workers/data-engine/src/scraper-performance-instrumentation.js");
  assert.match(instrumentation, /NEUD_SCRAPER_PERFORMANCE_CAPTURE === "1"/);
  assert.match(instrumentation, /sanitizeUrlForDiagnostics/);
  assert.doesNotMatch(instrumentation, /console\.log\(.*password/i);
});

test("legacy runtime marks stages without removing scrape flow", () => {
  const legacy = read("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  assert.match(legacy, /page\.reload\(\{ waitUntil: "networkidle2"/);
  assert.match(legacy, /getActiveScraperPerformanceRecorder/);
  assert.match(legacy, /scrapeAuctionDisplayPage/);
});

test("engine scheduler waits after cycle completion", () => {
  const runtime = read("workers/data-engine/src/engine-runtime.js");
  assert.match(runtime, /waitUntilNextPoll/);
  assert.match(runtime, /pollCompletedAt \+ activeIntervalMs/);
  assert.match(runtime, /activeScrapePromise = adapter\.scrapeOnce/);
});

test("poll interval semantics unchanged in adapter config", () => {
  const adapter = read("workers/data-engine/src/adapters/bag-auction.js");
  assert.match(adapter, /poll_interval_ms/);
  assert.match(adapter, /POLL_MS: bundle\.settings\?\.poll_interval_ms \?\? 2500/);
});

test("diagnostic command and output exist", () => {
  assert.ok(
    fs.existsSync(
      path.join(repoRoot, "scripts/live-validation/diagnose-broad-arrow-scraper-performance.mjs"),
    ),
  );
  const pkg = read("package.json");
  assert.match(pkg, /diagnose:broad-arrow-scraper-performance/);
});

test("diagnostic pipeline documents post-completion polling", () => {
  const pipeline = read("scripts/live-validation/lib/broad-arrow-scraper-pipeline.mjs");
  assert.match(pipeline, /fixed-interval-after-cycle-completion/);
  assert.match(pipeline, /scrapeDurationMs \+ configuredPollIntervalMs/);
});

test("sensitive fields excluded from URL sanitizer behavior", () => {
  const instrumentation = read("workers/data-engine/src/scraper-performance-instrumentation.js");
  assert.match(instrumentation, /\[redacted\]/);
  assert.match(instrumentation, /SENSITIVE_QUERY_KEYS/);
});

test("worker lifecycle commands remain available", () => {
  const runtime = read("workers/data-engine/src/engine-runtime.js");
  const commands = read("workers/data-engine/src/commands.js");
  assert.match(runtime, /command === "start"/);
  assert.match(runtime, /command === "stop"/);
  assert.match(runtime, /command === "restart"/);
  assert.match(runtime, /command === "run_once"/);
  assert.match(commands, /claimNextCommand/);
});

test("network classification does not mark static assets as eventsource", async () => {
  const { classifyNetworkResource } = await import(
    pathToFileURL(
      path.join(repoRoot, "scripts/live-validation/lib/network-resource-classification.mjs"),
    ).href
  );
  assert.equal(
    classifyNetworkResource("https://cdn.example.com/app.css", "stylesheet", "text/css"),
    "stylesheet",
  );
  assert.equal(
    classifyNetworkResource("https://cdn.example.com/logo.png", "image", "image/png"),
    "image",
  );
  assert.equal(
    classifyNetworkResource(
      "https://faye.auctionaccelerate.com/faye?message=%5B%7B%22channel%22%3A%22%2Fmeta%2Fhandshake%22%7D%5D&jsonp=cb",
      "script",
      "application/javascript",
    ),
    "Faye/Bayeux handshake",
  );
});

test("instrumentation uses resource-type aware classification", () => {
  const instrumentation = read("workers/data-engine/src/scraper-performance-instrumentation.js");
  assert.match(instrumentation, /text\/event-stream/);
  assert.doesNotMatch(instrumentation, /eventsource\|sse/);
  assert.match(instrumentation, /Faye\/Bayeux/);
});

test("diagnose output includes fayeDiscovery after run", async () => {
  assert.match(read("scripts/live-validation/diagnose-broad-arrow-scraper-performance.mjs"), /fayeDiscovery/);
  const { buildFayeDiscovery } = await import(
    pathToFileURL(path.join(repoRoot, "scripts/live-validation/lib/faye-static-analysis.mjs")).href
  );
  const discovery = buildFayeDiscovery({ networkRequests: [] });
  assert.equal(discovery.fastPathFeasibility.fayeCarriesBid, true);
  assert.equal(discovery.fastPathFeasibility.currenciesCalculatedClientSide, true);
  assert.ok(discovery.recommendedFastPath.includes("Puppeteer"));
});
