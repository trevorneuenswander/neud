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

function normalizeLotNumberForMatch(value) {
  return String(value ?? "")
    .trim()
    .replace(/^lot\s+/i, "")
    .toUpperCase();
}

function findMatchingDownloadedLot(loadedLots, lotNumber) {
  const normalized = normalizeLotNumberForMatch(lotNumber);
  if (!normalized) return null;
  return (
    loadedLots.find(
      (lot) => normalizeLotNumberForMatch(lot.lotNumber) === normalized,
    ) ?? null
  );
}

function isPartialDownloadedLotEntry(normalizedInput, loadedLots) {
  if (!normalizedInput) return false;
  return loadedLots.some((lot) => {
    const candidate = normalizeLotNumberForMatch(lot.lotNumber);
    if (!candidate) return false;
    return candidate.startsWith(normalizedInput) || normalizedInput.startsWith(candidate);
  });
}

function resolveDownloadedLotMatch({ lotInput, loadedLots, lastProcessedNormalizedLot }) {
  const normalizedLot = normalizeLotNumberForMatch(lotInput);

  if (normalizedLot && normalizedLot === lastProcessedNormalizedLot) {
    return { action: "skip", normalizedLot };
  }

  if (!normalizedLot) {
    return { action: "clear", normalizedLot };
  }

  const lot = findMatchingDownloadedLot(loadedLots, lotInput);
  if (lot) {
    return { action: "match", normalizedLot, lot };
  }

  if (isPartialDownloadedLotEntry(normalizedLot, loadedLots)) {
    return { action: "skip", normalizedLot };
  }

  return { action: "clear", normalizedLot };
}

const lots = [
  {
    stableId: "lot:101",
    lotNumber: "101",
    title: "Lot 101 Title",
    reserveStatus: "unknown",
  },
  {
    stableId: "lot:125",
    lotNumber: "125",
    title: "Lot 125 Title",
    reserveStatus: "offered_without_reserve",
  },
  {
    stableId: "lot:125a",
    lotNumber: "125A",
    title: "Lot 125A Title",
    reserveStatus: "unknown",
  },
  {
    stableId: "lot:208",
    lotNumber: "208",
    title: "Lot 208 Title",
    reserveStatus: "unknown",
  },
];

test("exact lot matching preserves suffixes and optional Lot prefix", () => {
  assert.equal(findMatchingDownloadedLot(lots, "125")?.lotNumber, "125");
  assert.equal(findMatchingDownloadedLot(lots, "Lot 125")?.lotNumber, "125");
  assert.equal(findMatchingDownloadedLot(lots, "125A")?.lotNumber, "125A");
  assert.notEqual(findMatchingDownloadedLot(lots, "125A")?.lotNumber, "125");
  assert.equal(findMatchingDownloadedLot(lots, "999"), null);
});

test("partial typing defers clear while a downloaded lot prefix still matches", () => {
  assert.equal(
    resolveDownloadedLotMatch({
      lotInput: "12",
      loadedLots: lots,
      lastProcessedNormalizedLot: null,
    }).action,
    "skip",
  );
  assert.equal(
    resolveDownloadedLotMatch({
      lotInput: "999",
      loadedLots: lots,
      lastProcessedNormalizedLot: "125",
    }).action,
    "clear",
  );
});

test("match-to-match transition resolves a new downloaded lot", () => {
  const first = resolveDownloadedLotMatch({
    lotInput: "125",
    loadedLots: lots,
    lastProcessedNormalizedLot: null,
  });
  assert.equal(first.action, "match");
  assert.equal(first.lot.lotNumber, "125");

  const second = resolveDownloadedLotMatch({
    lotInput: "208",
    loadedLots: lots,
    lastProcessedNormalizedLot: "125",
  });
  assert.equal(second.action, "match");
  assert.equal(second.lot.lotNumber, "208");
});

test("match to unmatched to match resolves clear then populate", () => {
  assert.equal(
    resolveDownloadedLotMatch({
      lotInput: "999",
      loadedLots: lots,
      lastProcessedNormalizedLot: "125",
    }).action,
    "clear",
  );
  assert.equal(
    resolveDownloadedLotMatch({
      lotInput: "101",
      loadedLots: lots,
      lastProcessedNormalizedLot: "999",
    }).action,
    "match",
  );
});

test("same normalized lot input skips repeat population", () => {
  assert.equal(
    resolveDownloadedLotMatch({
      lotInput: "125",
      loadedLots: lots,
      lastProcessedNormalizedLot: "125",
    }).action,
    "skip",
  );
});

test("controller clears unmatched lot fields and blocks stale envelope restore", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /applyDownloadedLotMatch/);
  assert.match(controller, /clearUnmatchedLotProperties/);
  assert.match(controller, /lotNumberInputRef/);
  assert.match(controller, /lastProcessedNormalizedLotRef/);
  assert.match(controller, /resolveDownloadedLotMatch/);
  assert.match(controller, /unmatchedLotDraftRef/);
  assert.match(controller, /300\)/);
  assert.doesNotMatch(
    controller,
    /if \(isLotNumberFocused \|\| lotIsDirtyRef\.current\)[\s\S]*typed-match/s,
  );
});

test("envelope sync still protects lot draft while lot number is dirty or focused", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /lotFieldProtected/);
  assert.match(controller, /unmatchedLotDraftRef\.current/);
  assert.match(controller, /isLotNumberFocused/);
  assert.match(controller, /isLotNumberDirty/);
  assert.match(controller, /lotIsDirtyRef\.current/);
  assert.match(controller, /titleFieldProtected/);
});
