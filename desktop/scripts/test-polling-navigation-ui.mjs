import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const POLL_SLIDER_STEPS_MS = [
  1000, 2000, 2500, 3000, 4000, 5000, 10000, 15000, 20000, 30000, 45000, 60000,
  120000, 180000, 300000, 600000, 900000, 1200000, 1800000, 2700000, 3600000,
];

const POLL_PRESETS_MS = [1000, 2500, 5000, 10000, 15000, 30000, 60000];

function readSrc(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function pollIntervalToSliderIndex(ms) {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < POLL_SLIDER_STEPS_MS.length; index += 1) {
    const distance = Math.abs(POLL_SLIDER_STEPS_MS[index] - ms);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }

  return closestIndex;
}

function sliderIndexToPollIntervalMs(index) {
  const clampedIndex = Math.max(
    0,
    Math.min(POLL_SLIDER_STEPS_MS.length - 1, Math.round(index)),
  );
  return POLL_SLIDER_STEPS_MS[clampedIndex];
}

function snapPollIntervalMs(ms) {
  if (POLL_PRESETS_MS.includes(ms)) {
    return ms;
  }
  return sliderIndexToPollIntervalMs(pollIntervalToSliderIndex(ms));
}


test("sidebar uses viewport height layout without default overflow scroll", () => {
  const sidebar = readSrc("src/components/portal/Sidebar.tsx");
  const shell = readSrc("src/components/portal/AppShell.tsx");

  assert.ok(sidebar.includes("h-full"));
  assert.ok(sidebar.includes("overflow-hidden"));
  assert.ok(sidebar.includes("sticky top-0"));
  assert.ok(shell.includes("h-dvh"));
  assert.ok(shell.includes("overflow-hidden"));
});

test("disclosure sections animate open and closed with rotating arrow", () => {
  const disclosure = readSrc("src/components/ui/DisclosureSection.tsx");

  assert.ok(disclosure.includes("aria-expanded"));
  assert.ok(disclosure.includes("aria-controls"));
  assert.ok(disclosure.includes("grid-rows-[1fr]"));
  assert.ok(disclosure.includes("grid-rows-[0fr]"));
  assert.ok(disclosure.includes("rotate-90"));
  assert.ok(disclosure.includes("duration-200"));
  assert.ok(disclosure.includes("motion-reduce:transition-none"));
});

test("custom slider range spans one second through sixty minutes", () => {
  const constants = readSrc("src/lib/data-engines/constants.ts");

  assert.ok(constants.includes("3600000"));
  assert.equal(sliderIndexToPollIntervalMs(0), 1000);
  assert.equal(
    sliderIndexToPollIntervalMs(POLL_SLIDER_STEPS_MS.length - 1),
    3_600_000,
  );
  assert.equal(pollIntervalToSliderIndex(5000), POLL_SLIDER_STEPS_MS.indexOf(5000));
  assert.equal(snapPollIntervalMs(8500), 10000);
  assert.equal(snapPollIntervalMs(2500), 2500);
  assert.equal(POLL_SLIDER_STEPS_MS.indexOf(2500), 2);
});

test("average poll rate uses scheduled poll execution timestamps with gap filtering", () => {
  const stats = readSrc("src/components/data-engines/webpage-scraper/EngineStatistics.tsx");
  const health = readSrc("src/lib/data-engines/health.ts");

  assert.ok(stats.includes("calculateAveragePollRateMs"));
  assert.ok(stats.includes("formatAveragePollRate"));
  assert.ok(stats.includes("pollIntervalMs"));
  assert.ok(!stats.includes("formatPollInterval(pollIntervalMs"));
  assert.ok(health.includes("calculateAveragePollRateMs"));
  assert.ok(health.includes('runType === "run_once"'));
  assert.ok(health.includes("scrape.failed"));
  assert.ok(health.includes("AVERAGE_POLL_RATE_MAX_INTERVALS = 100"));
  assert.ok(!health.includes("recentSnapshots"));
});

test("worker waitUntilNextPoll reschedules using updated interval", () => {
  const runtime = readSrc("workers/data-engine/src/engine-runtime.js");

  assert.ok(runtime.includes("waitUntilNextPoll"));
  assert.ok(runtime.includes("formatPollingIntervalChangeMessage"));
  assert.ok(runtime.includes("pollCompletedAt + activeIntervalMs"));
  assert.ok(!runtime.includes("interruptiblePollIntervalSleep"));
});

test("runtime diagnostics removes duplicate bottom last poll text", () => {
  const diagnostics = readSrc(
    "src/components/data-engines/webpage-scraper/RuntimeDiagnostics.tsx",
  );

  assert.ok(diagnostics.includes("Last Poll"));
  assert.ok(!diagnostics.includes("Latest poll"));
  assert.ok(!diagnostics.includes("Last successful poll"));
});

test("disclosure sections support lazy mount for preview iframes", () => {
  const disclosure = readSrc("src/components/ui/DisclosureSection.tsx");
  const card = readSrc("src/components/displays/DisplayCard.tsx");

  assert.ok(disclosure.includes("lazyMount"));
  assert.ok(card.includes("lazyMount"));
  assert.ok(card.includes("DisclosureSection"));
});

test("engine detail client cleanup does not stop desktop engine", () => {
  const detail = readSrc("src/components/data-engines/EngineDetailClient.tsx");
  const client = readSrc("src/lib/desktop/client.ts");
  const manager = readSrc("desktop/src/services/engine-manager.ts");

  assert.ok(!detail.includes('controlDesktopEngine(engine.id, "stop"'));
  assert.ok(!detail.includes("engines.stop"));
  assert.ok(client.includes("unsubscribeLogs"));
  assert.ok(!client.includes('controlDesktopEngine(engineId, "stop")'));
  assert.ok(manager.includes("class EngineManager"));
  assert.ok(manager.includes("subscribeLogs(window"));
  assert.ok(manager.includes("unsubscribeLogs(window"));
  assert.ok(!manager.includes("stop(engineId") || manager.includes("async stop("));
});

test("local controller unmount only clears polling interval not worker", () => {
  const detail = readSrc("src/components/data-engines/EngineDetailClient.tsx");

  assert.ok(detail.includes("window.clearInterval(interval)"));
  assert.ok(!detail.includes("controlDesktopEngine"));
});

test("custom interval label avoids pointer cursor and slider thumb uses grab", () => {
  const form = readSrc("src/components/data-engines/webpage-scraper/EngineSettingsForm.tsx");

  assert.ok(form.includes("cursor-default text-sm font-medium"));
  assert.ok(form.includes("cursor-grab"));
  assert.ok(form.includes("cursor-grabbing"));
  assert.ok(form.includes("onPointerUp={commitSliderInterval}"));
  assert.ok(form.includes("sliderIndexToPollIntervalMs"));
});

test("local settings persistence no longer logs interval change before worker ack", () => {
  const service = readSrc("desktop/src/services/local-data-service.ts");

  assert.ok(!service.includes("Polling interval changed to"));
});
