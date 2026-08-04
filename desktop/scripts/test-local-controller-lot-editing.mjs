#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("lot number input uses focus and dirty guards against envelope sync", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /isLotNumberFocused/);
  assert.match(controller, /setIsLotNumberFocused\(true\)/);
  assert.match(controller, /lotFieldProtected/);
  assert.match(
    controller,
    /if \(lotFieldProtected \|\| bidFieldProtected \|\| titleFieldProtected \|\| reserveFieldProtected\)/,
  );
});

test("typed lot match runs while focused via debounced applyDownloadedLotMatch", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /applyDownloadedLotMatch\(lotNumberInputRef\.current\)/);
  assert.match(controller, /lotNumberInputRef\.current = event\.target\.value/);
  assert.doesNotMatch(
    controller,
    /if \(isLotNumberFocused \|\| lotIsDirtyRef\.current\)/,
  );
});

test("unmatched lot clears all dependent fields unconditionally", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /clearUnmatchedLotProperties/);
  assert.match(controller, /title: ""/);
  assert.match(controller, /reserveStatus: "unknown"/);
  assert.match(controller, /setPhotoPreviewLotNumber\(null\)/);
});

test("manual title edits survive polling refresh", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /titleFieldProtected/);
  assert.match(controller, /titleEditedRef\.current/);
});

test("lot draft sync effect is declared after dirty derived state", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  const dirtyIndex = controller.indexOf("const isLotNumberDirty =");
  const syncIndex = controller.indexOf("lotFieldProtected");
  assert.ok(dirtyIndex >= 0);
  assert.ok(syncIndex > dirtyIndex);
});

test("submit lot path regenerates labeled currencies when bid exists", () => {
  const service = read("desktop/src/bag/live-state/bag-live-state-service.ts");
  assert.match(service, /buildBidCurrencyStrings/);
  assert.match(service, /buildManualBidCurrencyDisplayStrings/);
});

function normalizeLotNumberForMatch(value) {
  return String(value ?? "")
    .trim()
    .replace(/^lot\s+/i, "")
    .toUpperCase();
}

function findDownloadedLotIndex(loadedLots, stableId) {
  return loadedLots.findIndex((lot) => lot.stableId === stableId);
}

function buildSelectedLotPersistenceKey(lot) {
  const stableId = lot.stableId.trim();
  if (stableId) {
    return stableId;
  }
  return `lot:${normalizeLotNumberForMatch(lot.lotNumber).toLowerCase()}`;
}

function findDownloadedLotIndexByPersistenceKey(loadedLots, selectedLotKey) {
  const key = selectedLotKey.trim();
  if (!key) {
    return -1;
  }

  const byStableId = findDownloadedLotIndex(loadedLots, key);
  if (byStableId >= 0) {
    return byStableId;
  }

  if (key.startsWith("lot:")) {
    const normalized = key.slice(4).toUpperCase();
    return loadedLots.findIndex(
      (lot) => normalizeLotNumberForMatch(lot.lotNumber) === normalized,
    );
  }

  const normalizedKey = normalizeLotNumberForMatch(key);
  if (normalizedKey) {
    return loadedLots.findIndex(
      (lot) => normalizeLotNumberForMatch(lot.lotNumber) === normalizedKey,
    );
  }

  return -1;
}

const sampleLots = [
  { stableId: "id:lot-124", lotNumber: "124", title: "Lot 124" },
  { stableId: "id:lot-125", lotNumber: "125", title: "Lot 125" },
  { stableId: "id:lot-126", lotNumber: "126", title: "Lot 126" },
];

test("selected lot persistence resolves lot identity instead of array index", () => {
  const reorderedLots = [sampleLots[2], sampleLots[0], sampleLots[1]];
  const key = buildSelectedLotPersistenceKey(sampleLots[1]);
  assert.equal(key, "id:lot-125");
  assert.equal(findDownloadedLotIndexByPersistenceKey(reorderedLots, key), 2);
});

test("missing saved lot falls back safely during persistence lookup", () => {
  assert.equal(findDownloadedLotIndexByPersistenceKey(sampleLots, "id:missing"), -1);
  assert.equal(findDownloadedLotIndexByPersistenceKey(sampleLots, ""), -1);
});

test("first-lot and last-lot button states derive from restored index", () => {
  const firstIndex = findDownloadedLotIndexByPersistenceKey(sampleLots, "id:lot-124");
  const lastIndex = findDownloadedLotIndexByPersistenceKey(sampleLots, "id:lot-126");
  assert.equal(firstIndex, 0);
  assert.equal(lastIndex, 2);
  assert.equal(firstIndex > 0, false);
  assert.equal(lastIndex < sampleLots.length - 1, false);
});

test("local controller selected lot persists per user and project in session storage", () => {
  const session = read("src/lib/bag/local-controller-session-lot.ts");
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(session, /SESSION_SELECTED_LOT_PREFIX/);
  assert.match(session, /sessionStorage\.getItem/);
  assert.match(session, /sessionStorage\.setItem/);
  assert.match(session, /readSessionSelectedLotKey/);
  assert.match(session, /writeSessionSelectedLotKey/);
  assert.match(controller, /readSessionSelectedLotKey/);
  assert.match(controller, /writeSessionSelectedLotKey/);
  assert.match(controller, /localGetAuthSession/);
  assert.doesNotMatch(controller, /localGetControllerSelectedLot/);
  assert.doesNotMatch(controller, /localSaveControllerSelectedLot/);
});

test("fresh startup with downloaded lots selects the first lot automatically", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  const restoreIndex = controller.indexOf("findDownloadedLotIndexByPersistenceKey");
  const defaultIndex = controller.indexOf('selectDownloadedLotByIndex(0, "downloaded-selection")');
  assert.ok(restoreIndex >= 0);
  assert.ok(defaultIndex > restoreIndex);
  assert.match(controller, /selectDownloadedLotByIndex\(0, "downloaded-selection"\)/);
  assert.match(controller, /populateControllerFromDownloadedLot/);
});

test("fresh session selects first lot while route navigation restores session lot", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /readSessionSelectedLotKey/);
  assert.match(controller, /if \(sessionKey\)/);
});

test("initialization waits for downloaded lots and auth before selecting first lot", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /activeDatasetResolved/);
  assert.match(controller, /sessionAuthReady/);
  assert.match(controller, /if \(!activeDatasetResolved \|\| !sessionAuthReady\)/);
  assert.match(controller, /if \(downloadedNav\.loadedLots\.length === 0\)/);
  assert.match(controller, /if \(initialDownloadedLotSelectionDoneRef\.current\)/);
  assert.doesNotMatch(controller, /sessionUserIdRef\.current === undefined/);
});

test("session restoration takes precedence over first-lot selection", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  const sessionRestore = controller.indexOf("if (sessionKey)");
  const defaultIndex = controller.indexOf('selectDownloadedLotByIndex(0, "downloaded-selection")');
  assert.ok(sessionRestore >= 0);
  assert.ok(defaultIndex > sessionRestore);
});

test("local controller restores session lot before defaulting to first lot", () => {
  const hook = read("src/components/bag-graphics/useDownloadedLotNavigation.ts");
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(hook, /useState\(-1\)/);
  assert.match(hook, /isSelectionRestoring/);
  assert.doesNotMatch(hook, /setSelectedDownloadedLotIndex\(0\)/);
  assert.match(controller, /hasResolvedInitialLot/);
  assert.match(controller, /sessionUserIdRef/);
  assert.match(controller, /findDownloadedLotIndexByPersistenceKey/);
  assert.match(controller, /persistSelectedLotKey/);
  assert.match(controller, /if \(!hasResolvedInitialLot\)/);
});

test("initial default selection does not overwrite session selection before resolution completes", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /lastPersistedLotKeyRef\.current = readSessionSelectedLotKey/);
  assert.match(controller, /if \(nextKey === lastPersistedLotKeyRef\.current\)/);
  assert.match(controller, /hasResolvedInitialLotRef\.current = true/);
});

test("switching data sources preserves selected lot via session key lookup", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /initialDownloadedLotSelectionDoneRef\.current = false/);
  assert.match(controller, /findDownloadedLotIndexByPersistenceKey/);
  assert.match(controller, /persistSelectedLotKey/);
});
