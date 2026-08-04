#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getRepoRoot, loadLiveValidationEnv } from "./lib/env.mjs";
import { readLocalBroadArrowState } from "./lib/local-neud-db.mjs";

const PROJECT_SLUG = "broad-arrow-auctions";

function parseSetting(settings, key) {
  const raw = settings?.get?.(key);
  if (raw == null) {
    return null;
  }
  try {
    return JSON.parse(String(raw));
  } catch {
    return String(raw);
  }
}

async function readLocalPipelineHints(repoRoot, projectId) {
  const databasePath = path.join(
    process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming"),
    "NEUD",
    "data",
    "neud.sqlite",
  );
  const configured = process.env.NEUD_LOCAL_DATABASE_PATH?.trim();
  const resolvedPath = configured ?? databasePath;

  if (!fs.existsSync(resolvedPath)) {
    return { localDatabasePath: resolvedPath, available: false };
  }

  let initSqlJs;
  try {
    initSqlJs = (await import("sql.js")).default;
  } catch {
    return { localDatabasePath: resolvedPath, available: false, reason: "sql.js unavailable" };
  }

  const wasmCandidates = [
    path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(repoRoot, "desktop", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  ];
  const wasmPath = wasmCandidates.find((candidate) => fs.existsSync(candidate));
  if (!wasmPath) {
    return { localDatabasePath: resolvedPath, available: false, reason: "wasm missing" };
  }

  const SQL = await initSqlJs({
    locateFile: (fileName) =>
      fileName === "sql-wasm.wasm" ? wasmPath : path.join(path.dirname(wasmPath), fileName),
  });
  const db = new SQL.Database(fs.readFileSync(resolvedPath));
  const settingsRows = db.exec(`SELECT key, value_json FROM app_settings`);
  const settings = new Map(
    (settingsRows[0]?.values ?? []).map((row) => [String(row[0]), row[1]]),
  );

  const globalPipeline = parseSetting(settings, "canonical.pipelineDiagnostics");
  const projectPipeline = projectId
    ? parseSetting(settings, `canonical.pipeline.project.${projectId}`)
    : null;
  const publishDiagnostics = projectId
    ? parseSetting(settings, `publishing.project.${projectId}.canonicalPublishDiagnostics`)
    : null;
  const displayDataSource = parseSetting(settings, "displayDataSource");

  db.close();

  return {
    localDatabasePath: resolvedPath,
    available: true,
    displayDataSource,
    globalPipeline,
    projectPipeline,
    publishDiagnostics,
  };
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  loadLiveValidationEnv(repoRoot);
  const localState = await readLocalBroadArrowState(repoRoot);
  const projectId = localState.project?.id ?? null;
  const hints = projectId
    ? await readLocalPipelineHints(repoRoot, projectId)
    : { available: false };

  const summary = {
    projectSlug: PROJECT_SLUG,
    localProjectUuid: projectId,
    selectedDataSource: hints.displayDataSource ?? null,
    controllerStateRevision: hints.projectPipeline?.controllerStateRevision ?? null,
    scraperStateRevision: hints.projectPipeline?.scraperStateRevision ?? null,
    canonicalSourceUsed:
      hints.projectPipeline?.canonicalSourceUsed ?? hints.displayDataSource ?? null,
    localCanonicalRevision: hints.projectPipeline?.localCanonicalRevision ?? null,
    localContentFingerprint: hints.projectPipeline?.localContentFingerprint ?? null,
    localCanonicalDigestPrefix: hints.projectPipeline?.localCanonicalDigestPrefix ?? null,
    lastControllerChangeAt: hints.projectPipeline?.lastControllerChangeAt ?? null,
    lastControllerActionType: hints.projectPipeline?.lastControllerActionType ?? null,
    lastScraperChangeAt: hints.projectPipeline?.lastScraperChangeAt ?? null,
    lastCanonicalInputChangedAt: hints.projectPipeline?.lastCanonicalInputChangedAt ?? null,
    lastCanonicalRegeneratedAt: hints.projectPipeline?.lastCanonicalRegeneratedAt ?? null,
    lastCanonicalDigestChangedAt: hints.projectPipeline?.lastCanonicalDigestChangedAt ?? null,
    lastCanonicalPublicationTriggerReason:
      hints.projectPipeline?.lastCanonicalPublicationTriggerReason ?? null,
    lastChangedStructuralGroups: hints.projectPipeline?.lastChangedStructuralGroups ?? [],
    lastCanonicalPublicationRequestedAt:
      hints.publishDiagnostics?.lastCanonicalPublishRequestedAt ?? null,
    lastCanonicalPublicationAttemptAt:
      hints.publishDiagnostics?.lastCanonicalPublicationAttemptAt ?? null,
    lastCanonicalPublicationResult:
      hints.publishDiagnostics?.lastCanonicalPublicationResult ?? null,
    lastCanonicalPublishedRevision:
      hints.publishDiagnostics?.lastCanonicalPublishedRevision ?? null,
    lastCanonicalPublishedHashPrefix:
      hints.publishDiagnostics?.lastCanonicalPublishedHashPrefix ?? null,
    lastCanonicalNoChangeAt: hints.publishDiagnostics?.lastCanonicalNoChangeAt ?? null,
    lastCanonicalFailureCode: hints.publishDiagnostics?.lastCanonicalFailureCode ?? null,
    canonicalPublicationPending: hints.publishDiagnostics?.canonicalPublicationPending ?? null,
    canonicalPublicationInProgress:
      hints.publishDiagnostics?.canonicalPublicationInProgress ?? null,
    lastOnlineViewerReconcileAt: hints.projectPipeline?.lastOnlineViewerReconcileAt ?? null,
    lastHeartbeatCycleAt: hints.projectPipeline?.lastHeartbeatCycleAt ?? null,
    notes: [
      "Run NEUD Desktop and perform one controller or scraper change before reading this report.",
      "Payload values, credentials, and tokens are intentionally excluded.",
    ],
  };

  const outputPath = path.join(repoRoot, "docs", "broad-arrow-canonical-change-diagnostic.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
