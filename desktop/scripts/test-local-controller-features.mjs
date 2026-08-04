import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildNavigationCapabilities,
  createEmptyManualLotNavigation,
  orderedLotsFromDataset,
  resolveNavigationStartingLot,
  selectAdjacentLot,
} from "../dist/bag/live-state/bag-manual-lot-navigation.js";
import { lotIdentity } from "../dist/bag/live-state/bag-lot-navigation.js";
import {
  buildManualBidCurrencyDisplayStrings,
} from "../dist/services/currency-rate-service.js";
import {
  filterDeprecatedActivityEntries,
  isDeprecatedActivityType,
} from "../dist/services/deprecated-activity-types.js";
import { resolveLocalControllerDisplayData } from "../dist/displays/resolve-local-controller-display-data.js";
import { mapLiveStateToPylonFeed } from "../dist/displays/pylon-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const orderedLots = [
  { id: "100", lotNumber: "100", title: "Lot 100" },
  { id: "101", lotNumber: "101", title: "Lot 101" },
  { id: "101A", lotNumber: "101A", title: "Lot 101A" },
  { id: "102", lotNumber: "102", title: "Lot 102" },
];

test("navigation starting lot priority uses draft, cursor, submitted, dataset, first", () => {
  const navigation = createEmptyManualLotNavigation();
  navigation.cursorLotId = lotIdentity(orderedLots[1]);

  const fromDraft = resolveNavigationStartingLot({
    draft: { lotNumber: "101A", title: "Draft", lotDirty: true, currentBid: null, currentBidLabel: "", bidDirty: false },
    navigation,
    submittedLot: orderedLots[1],
    datasetCurrentLot: orderedLots[0],
    lots: orderedLots,
  });
  assert.equal(fromDraft?.lotNumber, "101A");

  const fromCursor = resolveNavigationStartingLot({
    draft: { lotNumber: "", title: "", lotDirty: false, currentBid: null, currentBidLabel: "", bidDirty: false },
    navigation,
    submittedLot: orderedLots[1],
    datasetCurrentLot: orderedLots[0],
    lots: orderedLots,
  });
  assert.equal(fromCursor?.lotNumber, "101");

  const fromSubmitted = resolveNavigationStartingLot({
    draft: { lotNumber: "", title: "", lotDirty: false, currentBid: null, currentBidLabel: "", bidDirty: false },
    navigation: createEmptyManualLotNavigation(),
    submittedLot: orderedLots[2],
    datasetCurrentLot: orderedLots[0],
    lots: orderedLots,
  });
  assert.equal(fromSubmitted?.lotNumber, "101A");
});

test("orderedLotsFromDataset preserves dataset order including suffix lot ids", () => {
  const dataset = {
    lots: [
      { lot: "101A", title: "Suffix lot" },
      { lot: "100", title: "First" },
      { lot: "102", title: "Last" },
    ],
  };
  const ordered = orderedLotsFromDataset(orderedLots, dataset);
  assert.deepEqual(
    ordered.map((lot) => lot.lotNumber),
    ["101A", "100", "102"],
  );
});

test("navigation boundaries disable previous at first lot and next at last lot", () => {
  const first = buildNavigationCapabilities(orderedLots, orderedLots[0]);
  assert.equal(first.canSelectPrevious, false);
  assert.equal(first.canSelectNext, true);

  const last = buildNavigationCapabilities(orderedLots, orderedLots[3]);
  assert.equal(last.canSelectPrevious, true);
  assert.equal(last.canSelectNext, false);
});

test("selectAdjacentLot moves one position without wrap", () => {
  const next = selectAdjacentLot(orderedLots, orderedLots[1], "next");
  assert.equal(next?.lotNumber, "101A");
  assert.equal(selectAdjacentLot(orderedLots, orderedLots[3], "next"), null);
  assert.equal(selectAdjacentLot(orderedLots, orderedLots[0], "previous"), null);
});

test("formatManualLotTitle combines year and title for controller lookup", () => {
  const validation = readSrc("desktop/src/bag/live-state/bag-manual-validation.ts");
  assert.ok(validation.includes("formatManualLotTitle"));
  assert.ok(validation.includes("startsWith(year)"));
});

test("offline export resolves lot details from downloaded dataset", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  assert.ok(exportService.includes("getLotDetailsFromDataset"));
  assert.ok(exportService.includes("findLotInDataset"));
  assert.ok(exportService.includes("reserveStatus"));
});

test("controller lot draft auto-fills title from dataset lookup", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.ok(controller.includes("getLotDatasetDetails"));
  assert.ok(controller.includes("titleEditedRef"));
  assert.ok(controller.includes("reserveEditedRef"));
  assert.ok(controller.includes("Reserve Status:"));
});

test("manual bid currency strings include labels for display mapping", () => {
  const currencies = buildManualBidCurrencyDisplayStrings(25000, {
    base: "USD",
    rates: { EUR: 0.92, GBP: 0.79, CHF: 0.88, JPY: 150 },
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(currencies.length, 4);
  for (const value of currencies) {
    assert.match(value, /^(EUR|GBP|CHF|JPY)\s+/);
  }

  const resolved = resolveLocalControllerDisplayData({
    submitted: {
      currentLot: {
        lotNumber: "101",
        title: "Test",
        currentBid: 25000,
        currentBidLabel: "$25,000",
      },
      auctionDisplay: {
        currencies,
      },
    },
  });
  const pylon = mapLiveStateToPylonFeed(resolved);
  assert.match(pylon.auctionDisplay.currencies[0], /^EUR\s+/);
  assert.match(pylon.auctionDisplay.currencies[1], /^GBP\s+/);
});

test("deprecated activity types are filtered from presentation", () => {
  assert.equal(isDeprecatedActivityType("controller.lot-updated"), true);
  assert.equal(isDeprecatedActivityType("controller.bid-updated"), true);
  assert.equal(isDeprecatedActivityType("display.fullscreen"), true);

  const filtered = filterDeprecatedActivityEntries([
    { type: "controller.lot-updated", message: "old" },
    { type: "engine.started", message: "keep" },
  ]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.type, "engine.started");
});

test("controller UI wires navigation capability disabled states", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.ok(controller.includes("manualLotNavigationCapabilities"));
  assert.ok(controller.includes("canSelectPrevious"));
  assert.ok(controller.includes("canSelectNext"));
  assert.ok(controller.includes("aria-disabled"));
  assert.ok(!controller.includes("Manual Lot Submitted"));
  assert.ok(!controller.includes("downloadSuccessTimerRef") || controller.includes("downloadButtonState"));
});

test("offline export uses package folder with auction.json and worker photo download", () => {
  const paths = readSrc("desktop/src/services/auction-data-paths.ts");
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const worker = readSrc("workers/data-engine/src/adapters/bag-photo-download.js");
  const runtime = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");

  assert.ok(paths.includes("auction.json"));
  assert.ok(paths.includes("resolveUniqueAuctionPackageDirectory"));
  assert.ok(exportService.includes("photoDownloadRoot"));
  assert.ok(exportService.includes("displayUrl"));
  assert.ok(worker.includes('"photos"'));
  assert.ok(worker.includes("lot-"));
  assert.ok(runtime.includes("photoDownloadRoot"));
});

test("bag routes stop manual lot and bid activity and log execution events", () => {
  const routes = readSrc("desktop/src/bag/live-state/bag-live-state-routes.ts");
  assert.ok(!routes.includes('type: "controller.lot-updated"'));
  assert.ok(!routes.includes('type: "controller.bid-updated"'));
  assert.ok(routes.includes("controller.lot.navigation"));
  assert.ok(routes.includes("controller.lot.submitted"));
  assert.ok(routes.includes("controller.bid.submitted"));
});

test("display card no longer records fullscreen activity", () => {
  const card = readSrc("src/components/displays/DisplayCard.tsx");
  assert.ok(!card.includes("display.fullscreen"));
});
