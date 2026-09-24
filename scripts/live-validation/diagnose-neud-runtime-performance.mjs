#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function analyzeSource() {
  const devCard = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  const displayCard = read("src/components/displays/DisplayCard.tsx");
  const displayConnection = read("public/displays/shared/display-connection.js");
  const appSettings = read("desktop/src/repositories/app-settings-repository.ts");
  const localDb = read("desktop/src/database/connection.ts");
  const session = read("desktop/src/services/supabase-user-session.ts");
  const coordinator = read("desktop/src/services/authenticated-cloud-coordinator.ts");
  const localData = read("desktop/src/services/local-data-service.ts");

  return {
    generatedAt: new Date().toISOString(),
    processMemory: {
      main: null,
      renderer: null,
      next: null,
      worker: null,
      puppeteer: null,
      note: "Run under live desktop dev and extend this script to sample RSS when NEUD_PERF_SAMPLE=1",
    },
    http: {
      activeRequests: null,
      maxConcurrent: null,
      requestsPerMinute: null,
      slowestRoutes: null,
    },
    displayPreview: {
      pollers: {
        iframeRuntime: displayConnection.includes("createDisplayDataPoller"),
        managementCardParentPoll: devCard.includes("setInterval") && devCard.includes("pollDataEndpoint"),
        displayCardParentPoll: displayCard.includes("pollDataEndpoint"),
      },
      activePollers: {
        parentPollWhenPreviewExpanded: devCard.includes("previewOpen") && devCard.includes("pollDataEndpoint"),
        iframeSingleFlight: displayConnection.includes("if (dataInFlight)"),
      },
      maxConcurrentPerDisplay: displayConnection.includes("dataInFlight") ? 1 : null,
      duplicateTransportDetected:
        !devCard.includes("pollDataEndpoint") &&
        displayConnection.includes("createDisplayDataPoller"),
      timestampPollCaller: "display-connection.js pollOnce (appends &_=timestamp)",
      plainPollCaller: devCard.includes("pollDataEndpoint")
        ? "DeveloperHtmlDisplayCard parent fetch"
        : "none detected in source",
    },
    database: {
      fileSize: null,
      identicalAppSettingsSkip: appSettings.includes("existing?.value_json === nextJson"),
      debouncedPersist: localDb.includes("schedulePersist"),
      fullExportOnEveryRun: localDb.includes("this.db.export()"),
    },
    cloud: {
      peekClientCache: session.includes("peekAuthenticatedClient"),
      diagnosticsWriteDedupe: session.includes("lastPersistedSharedDiagnosticsJson"),
      coordinatorCacheHit: coordinator.includes("cache_hit"),
      displaySyncCoalesce: read("desktop/src/services/display-sync/display-sync-service.ts").includes(
        "if (this.syncInProgress)",
      ),
    },
    displayDataHotPath: {
      skipsDiagnosticsRefreshOnRead: !localData.match(
        /getGenericDisplayBridgeData[\s\S]*?refreshStreamTickerFilterDiagnostics/,
      ),
      auctionDayCache: localData.includes("auctionDayOptionsCache"),
    },
    firstPerformanceFailureStage:
      "duplicate preview polling + per-getClient SQLite diagnostic export storm (see displayPreview + database + cloud sections)",
  };
}

const report = analyzeSource();
const outPath = path.join(repoRoot, "docs", "neud-runtime-performance.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
