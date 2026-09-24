#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRepoRoot } from "./lib/env.mjs";
import { readLocalBroadArrowState } from "./lib/local-neud-db.mjs";
import {
  openLocalSettingsDatabase,
  parseSetting,
  resolveLocalDatabasePath,
} from "./lib/shared-cloud-auth-diagnostics.mjs";

const repoRoot = getRepoRoot(import.meta.url);

function pathToFileURL(filePath) {
  return new URL(`file:///${filePath.replace(/\\/g, "/")}`);
}

function dayBuckets(lots) {
  return [
    ...new Set(
      lots
        .map((lot) => {
          const text = String(lot ?? "").trim();
          if (!text) return null;
          const match = text.match(/^(\d)/);
          return match ? Number(match[1]) : null;
        })
        .filter((day) => typeof day === "number"),
    ),
  ].sort((a, b) => a - b);
}

async function loadTickerModules() {
  const lowerTickerPath = path.join(
    repoRoot,
    "desktop",
    "dist",
    "displays",
    "lower-ticker-data.js",
  );
  const normalizePath = path.join(
    repoRoot,
    "desktop",
    "staging",
    "runtime-assets",
    "display",
    "normalize-display-snapshot.js",
  );
  if (!fs.existsSync(lowerTickerPath)) {
    throw new Error("Build desktop first (missing lower-ticker-data.js).");
  }
  const { mapSnapshotToLowerTickerFeed } = await import(
    pathToFileURL(lowerTickerPath).href
  );
  let resolveDisplayRuntimeSnapshot = null;
  if (fs.existsSync(normalizePath)) {
    await import(pathToFileURL(normalizePath).href);
    resolveDisplayRuntimeSnapshot = globalThis.resolveDisplayRuntimeSnapshot;
  }
  return { mapSnapshotToLowerTickerFeed, resolveDisplayRuntimeSnapshot };
}

async function main() {
  const local = await readLocalBroadArrowState(repoRoot);
  const { mapSnapshotToLowerTickerFeed, resolveDisplayRuntimeSnapshot } =
    await loadTickerModules();

  const projectId = local.project?.id ?? null;
  const filterSettingKey = projectId ? `streamTickerDayFilter:${projectId}` : null;
  let persistedDayFilter = "all";
  if (filterSettingKey && local.available) {
    try {
      const settings = await openLocalSettingsDatabase(
        resolveLocalDatabasePath(repoRoot),
        repoRoot,
      );
      persistedDayFilter = parseSetting(settings, filterSettingKey) ?? "all";
    } catch {
      persistedDayFilter = "all";
    }
  }
  const selectedDayFilter =
    persistedDayFilter === "all" ? "all" : Number(String(persistedDayFilter).replace(/\D/g, "")) || 1;

  const snapshot = {
    current: { lot: "205", title: "Sample current lot" },
    next: [
      { lot: "201", title: "Upcoming 2xx" },
      { lot: "202", title: "Upcoming 2xx b" },
      { lot: "301", title: "Upcoming 3xx" },
    ],
    lots: [
      { lot: "101", title: "Day 1 a" },
      { lot: "102", title: "Day 1 b" },
      { lot: "103", title: "Day 1 c" },
      { lot: "201", title: "Day 2 a" },
      { lot: "301", title: "Day 3 a" },
    ],
  };

  const feed = mapSnapshotToLowerTickerFeed(snapshot, {
    dayFilter: selectedDayFilter === "all" ? "all" : selectedDayFilter,
  });
  const bridgePayload = {
    snapshot,
    next: snapshot.next,
    streamTickerFeed: feed,
    broadArrowDisplay: { ticker: feed },
  };
  const runtimeSnapshot = resolveDisplayRuntimeSnapshot
    ? resolveDisplayRuntimeSnapshot(bridgePayload)
    : null;
  const runtimeNext = Array.isArray(runtimeSnapshot?.next) ? runtimeSnapshot.next : [];

  const report = {
    selectedDayFilter:
      selectedDayFilter === "all" ? "all" : `day-${selectedDayFilter}`,
    filterSettingKey,
    canonicalLotCount: snapshot.lots.length,
    canonicalNextDayBuckets: dayBuckets(snapshot.next.map((row) => row.lot)),
    eligibleLotCount: snapshot.lots.filter((row) => String(row.lot).startsWith("1")).length,
    filteredTickerNextCount: feed.next.length,
    filteredTickerNextDayBuckets: dayBuckets(feed.next.map((row) => row.lot)),
    finalDeliveredNextCount: runtimeNext.length,
    finalDeliveredNextDayBuckets: dayBuckets(runtimeNext.map((row) => row.lot)),
    filterPersisted: filterSettingKey ? persistedDayFilter != null : false,
    feedRegenerated: true,
    viewerNotified: null,
    firstFailureStage:
      JSON.stringify(feed.next.map((row) => row.lot)) !==
      JSON.stringify(runtimeNext.map((row) => row.lot))
        ? "filtered_next_overwritten"
        : "none",
    note:
      "Uses built-in sample canonical snapshot to validate mapper + runtime normalization. Live SQLite filter value is reported via filterSettingKey only.",
    localDatabasePath: local.databasePath ?? null,
    localDatabaseAvailable: local.available ?? false,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
