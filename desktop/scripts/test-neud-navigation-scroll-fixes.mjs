import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeDownloadedLots,
  orderedLotsFromDataset,
} from "../dist/bag/live-state/bag-manual-lot-navigation.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("canonical downloaded lot array orders lots numerically", () => {
  const dataset = {
    lots: [
      { lotNumber: "101A", title: "Lot 101A" },
      { lotNumber: "20", title: "Lot 20" },
      { lotNumber: "100", title: "Lot 100", id: "lot-100" },
    ],
  };
  const loadedLots = orderedLotsFromDataset([], dataset, true);
  assert.deepEqual(loadedLots.map((lot) => lot.lotNumber), ["20", "100", "101A"]);
});

test("client downloaded lot helpers normalize blank reserve and fields", () => {
  const navigation = readSrc("src/lib/bag/downloaded-lot-navigation.ts");
  assert.match(navigation, /export function buildManualDraftFromDownloadedLot/);
  assert.match(navigation, /export function resolveDownloadedLotReserveStatus/);
  assert.match(navigation, /if \(raw\.noReserve === true/);
  assert.match(navigation, /if \(raw\.reservesOff === true/);
  assert.match(navigation, /reservePrice/);
  assert.match(navigation, /return \{ status: "unknown", label: "" \}/);
  assert.match(navigation, /orderedLotsFromDataset/);
  assert.match(navigation, /preferDatasetOnly/);

  const lots = normalizeDownloadedLots({
    lots: [{ lotNumber: "55", title: "", id: "src-55", vehicleId: "veh-55" }],
  });
  assert.equal(lots[0]?.lotNumber, "55");
  assert.equal(lots[0]?.title, "");
});

test("navigation uses unified lot selection handlers", () => {
  const hook = readSrc("src/components/bag-graphics/useDownloadedLotNavigation.ts");
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(hook, /setSelectedDownloadedLotIndex/);
  assert.match(controller, /selectDownloadedLotByIndex/);
  assert.match(controller, /handlePreviousLot/);
  assert.match(controller, /handleNextLot/);
  assert.match(controller, /type="button"[\s\S]*handlePreviousLot/);
  assert.match(controller, /type="button"[\s\S]*handleNextLot/);
  assert.match(controller, /selectDownloadedLotByIndex/);
  assert.match(controller, /handlePreviousLot/);
  assert.match(controller, /handleNextLot/);
  assert.doesNotMatch(controller, /runDraftAction\("Previous lot"/);
  assert.doesNotMatch(controller, /runDraftAction\("Next lot"/);
});

test("photo preview keeps stable mount key while lot number updates", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /photoPreviewLotNumber/);
  assert.match(controller, /setPhotoPreviewLotNumber/);
  assert.match(controller, /key=\{`lot-photos-\$\{projectId\}`\}/);
});

test("download button enables only for active export statuses", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /const isDownloadActive =/);
  assert.match(controller, /isActiveWebpageExportStatus\(activeExportOperation\.status\)/);
  assert.match(controller, /disabled=\{isDownloadActive \|\| !canExportOffline\}/);
});

test("completion presentation survives navigation via dismissAfter", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(exportService, /dismissAfter/);
  assert.match(exportService, /presentationDismissedAt/);
  assert.match(exportService, /resolvePresentedExportOperation/);
  assert.match(controller, /Date\.parse\(operation\.dismissAfter\)/);
  assert.match(controller, /scheduleExportDismiss/);
});

test("project layout keeps navigation in flow with page scroll below", () => {
  const topMenu = readSrc("src/components/projects/ProjectTopMenuBar.tsx");
  const frame = readSrc("src/components/projects/ProjectLayoutFrame.tsx");
  assert.doesNotMatch(topMenu, /fixed left-0 right-0/);
  assert.match(frame, /project-layout-frame min-h-0 flex-1 overflow-y-auto/);
});
