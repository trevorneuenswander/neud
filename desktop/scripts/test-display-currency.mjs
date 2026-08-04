#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildDisplayCurrenciesFromUsd,
  buildManualBidCurrencyDisplayStrings,
  formatCurrencyValue,
  formatDisplayCurrencyRow,
  formatDisplayCurrencyRowsForPylon,
  normalizeDisplayCurrencies,
} from "../dist/displays/display-currency.js";
import { mapLiveStateToPylonFeed, mapSnapshotToPylonFeed } from "../dist/displays/pylon-data.js";
import { resolveLocalControllerDisplayData } from "../dist/displays/resolve-local-controller-display-data.js";
import { resolveEffectiveDisplayData } from "../dist/displays/resolve-effective-display-data.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const RATES = {
  base: "USD",
  rates: { EUR: 0.92, GBP: 0.79, CHF: 0.88, JPY: 1.64 },
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("manual bid currency strings include ISO codes and scraper symbols", () => {
  const rows = formatDisplayCurrencyRowsForPylon(
    ["EUR €115,000", "GBP £98,000", "CHF 110,000", "JPY ¥190,000"],
    "webpage-scraper",
  );
  assert.equal(rows.length, 4);
  assert.match(rows[0], /^EUR €/);
  assert.match(rows[1], /^GBP £/);
  assert.match(rows[2], /^CHF /);
  assert.match(rows[3], /^JPY ¥/);
});

test("local controller currency strings omit icons and use locale separators", () => {
  const rows = buildManualBidCurrencyDisplayStrings(125000, RATES);
  assert.deepEqual(rows, ["EUR 115.000", "GBP 98,750", "CHF 110'000", "JPY 205,000"]);
  for (const row of rows) {
    assert.doesNotMatch(row, /[€£¥]/);
  }
});

test("formatCurrencyValue applies source-aware separators for local controller", () => {
  assert.equal(
    formatCurrencyValue({ code: "EUR", value: 125000, source: "local-controller" }).formattedValue,
    "125.000",
  );
  assert.equal(
    formatCurrencyValue({ code: "CHF", value: 118000, source: "local-controller" }).formattedValue,
    "118'000",
  );
  assert.equal(
    formatCurrencyValue({ code: "GBP", value: 105000, source: "local-controller" }).formattedValue,
    "105,000",
  );
  assert.equal(
    formatCurrencyValue({ code: "JPY", value: 205000, source: "local-controller" }).formattedValue,
    "205,000",
  );
  assert.equal(
    formatCurrencyValue({ code: "EUR", value: 125000, source: "local-controller" }).icon,
    null,
  );
});

test("formatDisplayCurrencyRow avoids duplicated CHF prefix", () => {
  assert.equal(
    formatDisplayCurrencyRow({
      code: "CHF",
      rawValue: 110000,
      formattedValue: "110'000",
      icon: null,
    }),
    "CHF 110'000",
  );
});

test("scraper and local controller payloads normalize to labeled pylon rows", () => {
  const scraper = mapSnapshotToPylonFeed({
    auctionDisplay: {
      lot: "Lot 111",
      biddingPrice: "$125,000",
      currencies: ["EUR 115000", "GBP 98000", "CHF 110000", "JPY 190000"],
    },
  });

  for (const row of scraper.auctionDisplay.currencies) {
    assert.match(row, /^(EUR|GBP|CHF|JPY)\s+/);
  }

  const local = mapLiveStateToPylonFeed(
    resolveLocalControllerDisplayData({
      submitted: {
        currentLot: {
          lotNumber: "205",
          title: "Test Lot",
          currentBid: 125000,
          currentBidLabel: "$125,000",
        },
        auctionDisplay: {
          currencies: buildManualBidCurrencyDisplayStrings(125000, RATES),
        },
      },
    }),
  );

  assert.equal(local.auctionDisplay.currencies[0], "EUR 115.000");
  assert.equal(local.auctionDisplay.currencies[1], "GBP 98,750");
  assert.equal(local.auctionDisplay.currencies[2], "CHF 110'000");
  assert.equal(local.auctionDisplay.currencies[3], "JPY 205,000");
});

test("legacy bare local controller values gain labels through normalization", () => {
  const rows = formatDisplayCurrencyRowsForPylon(
    ["115,000", "98,000", "110,000", "190,000"],
    "local-controller",
  );
  assert.deepEqual(rows, ["EUR 115.000", "GBP 98,000", "CHF 110'000", "JPY 190,000"]);
});

test("resolveEffectiveDisplayData exposes labeled currencies for local controller", () => {
  const labeled = buildManualBidCurrencyDisplayStrings(125000, RATES);
  const effective = resolveEffectiveDisplayData({
    source: "local-controller",
    scraperSnapshot: null,
    localControllerState: null,
    submittedState: {
      currentLot: { lotNumber: "205", currentBid: 125000, currentBidLabel: "$125,000" },
      auctionDisplay: { currencies: labeled },
    },
  });

  assert.equal(effective.currency.displayCurrencies.length, 4);
  assert.equal(effective.currency.displayCurrencies[0], "EUR 115.000");
  assert.equal(effective.pylonFeed.auctionDisplay.currencies[0], "EUR 115.000");
});

test("normalizeDisplayCurrencies filters invalid and duplicate entries", () => {
  const currencies = normalizeDisplayCurrencies([
    "EUR  €115,000",
    "EUR  €999,999",
    "GBP  £98,000",
    "",
    "0",
  ]);
  assert.equal(currencies.length, 2);
  assert.equal(currencies[0]?.code, "EUR");
  assert.equal(currencies[1]?.code, "GBP");
});

test("buildDisplayCurrenciesFromUsd preserves EUR GBP CHF JPY order", () => {
  const currencies = buildDisplayCurrenciesFromUsd(125000, RATES, "local-controller");
  assert.deepEqual(
    currencies.map((entry) => entry.code),
    ["EUR", "GBP", "CHF", "JPY"],
  );
  assert.equal(currencies[0]?.icon, null);
});

test("scraper formatting does not inherit local controller separators", () => {
  const lcRows = buildManualBidCurrencyDisplayStrings(125000, RATES);
  const scraperRows = formatDisplayCurrencyRowsForPylon(lcRows, "webpage-scraper");
  assert.match(scraperRows[0], /^EUR €115,000$/);
  assert.match(scraperRows[2], /^CHF 110,000$/);
  assert.doesNotMatch(scraperRows[0], /115\.000/);
});

test("account panel renders name team role and connection in order", () => {
  const panel = read("src/components/portal/SidebarUserPanel.tsx");
  assert.match(panel, /sidebar-user-name/);
  assert.match(panel, /sidebar-user-team/);
  assert.match(panel, /sidebar-user-role/);
  assert.match(panel, /sidebar-user-connection/);
  assert.match(panel, /formatPlatformRole\(profile\.role\)/);
  assert.match(panel, /useInternetConnection/);
  assert.match(panel, /Checking connection/);
  assert.match(panel, /Online/);
  assert.match(panel, /Offline/);
  assert.match(panel, /text-success/);
  assert.match(panel, /text-destructive/);
  assert.doesNotMatch(panel, /Clear Local Session/);
});

test("connectivity probe combines browser state with remote auth status", () => {
  const connectivity = read("src/lib/connectivity/internet-connection.ts");
  const hook = read("src/lib/connectivity/use-internet-connection.ts");
  assert.match(connectivity, /navigator\.onLine/);
  assert.match(connectivity, /\/api\/auth\/status/);
  assert.match(connectivity, /probeInFlight/);
  assert.match(hook, /offline/);
  assert.match(hook, /online/);
  assert.match(hook, /visibilitychange/);
  assert.match(hook, /RECHECK_INTERVAL_MS/);
});

test("typed lot matching debounces and clears stale downloaded autofill", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /applyDownloadedLotMatch/);
  assert.match(controller, /clearUnmatchedLotProperties/);
  assert.match(controller, /300\)/);
  assert.match(controller, /lastProcessedNormalizedLotRef/);
});

test("lot editing state uses exact normalized matching", () => {
  const source = read("src/lib/bag/lot-editing-state.ts");
  assert.match(source, /normalizeLotNumberForMatch/);
  assert.match(source, /findMatchingDownloadedLot/);
});
