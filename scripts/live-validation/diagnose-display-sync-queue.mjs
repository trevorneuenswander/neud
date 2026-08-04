#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import { getRepoRoot, loadLiveValidationEnv } from "./lib/env.mjs";
import {
  mapQueueRow,
  summarizeQueueRows,
} from "./lib/display-sync-queue-inspection.mjs";
import { readLocalBroadArrowState, resolveLocalNeudDatabasePath } from "./lib/local-neud-db.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

async function openLocalDatabase(repoRoot) {
  const databasePath = resolveLocalNeudDatabasePath(repoRoot);
  if (!fs.existsSync(databasePath)) {
    return { databasePath, db: null };
  }

  const wasmCandidates = [
    path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(repoRoot, "desktop", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  ];
  const wasmPath = wasmCandidates.find((candidate) => fs.existsSync(candidate));
  if (!wasmPath) {
    throw new Error("sql.js wasm asset not found for local database probe.");
  }

  const SQL = await initSqlJs({
    locateFile: (fileName) =>
      fileName === "sql-wasm.wasm" ? wasmPath : path.join(path.dirname(wasmPath), fileName),
  });

  return {
    databasePath,
    db: new SQL.Database(fs.readFileSync(databasePath)),
  };
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  loadLiveValidationEnv(repoRoot);

  const { databasePath, db } = await openLocalDatabase(repoRoot);
  if (!db) {
    console.error(JSON.stringify({ databasePath, available: false }, null, 2));
    process.exit(1);
  }

  const displaySlugRows = db.exec(
    `SELECT d.id, COALESCE(c.slug, d.display_key) AS slug
     FROM displays d
     LEFT JOIN project_display_code c ON c.display_id = d.id`,
  );
  const displaySlugByEntityId = new Map(
    (displaySlugRows[0]?.values ?? []).map((row) => [String(row[0]), String(row[1])]),
  );

  const queueRows = db.exec(
    `SELECT id, entity_type, entity_id, operation_type, payload_json, created_at,
            attempt_count, last_attempt_at, last_error, sync_state, source_instance_id
     FROM display_sync_queue
     WHERE sync_state IN ('pending', 'failed', 'irrecoverable')
     ORDER BY created_at ASC`,
  );

  const mappedRows = (queueRows[0]?.values ?? []).map((row) =>
    mapQueueRow({
      id: row[0],
      entity_type: row[1],
      entity_id: row[2],
      operation_type: row[3],
      payload_json: row[4],
      created_at: row[5],
      attempt_count: row[6],
      last_attempt_at: row[7],
      last_error: row[8],
      sync_state: row[9],
      source_instance_id: row[10],
    }),
  );

  const queueSummary = summarizeQueueRows(mappedRows, displaySlugByEntityId);
  const broadArrow = await readLocalBroadArrowState(repoRoot);

  db.close();

  const summary = {
    databasePath,
    lastDisplaySyncResult: broadArrow.displaySyncRuntime?.lastSyncResult ?? null,
    lastPassAttempted: broadArrow.displaySyncRuntime?.lastPassAttempted ?? 0,
    lastPassSucceeded: broadArrow.displaySyncRuntime?.lastPassSucceeded ?? 0,
    lastPassFailed: broadArrow.displaySyncRuntime?.lastPassFailed ?? 0,
    lastPassSkipped: broadArrow.displaySyncRuntime?.lastPassSkipped ?? 0,
    lastPassRemainingEligible: broadArrow.displaySyncRuntime?.lastPassRemainingEligible ?? 0,
    lastPassRemainingDelayedRetry:
      broadArrow.displaySyncRuntime?.lastPassRemainingDelayedRetry ?? 0,
    eligibleNowCount: queueSummary.eligibleNowCount,
    delayedRetryCount: queueSummary.delayedRetryCount,
    pendingDisplayRows: queueSummary.pendingDisplayRows,
    pendingRevisionRows: queueSummary.pendingRevisionRows,
    pendingItems: queueSummary.items,
    streamBidRevision: queueSummary.items.find(
      (item) =>
        item.isRevisionOperation &&
        (item.displaySlug === "stream-bid-display" ||
          item.entityId === "4889d79c-7355-4171-a196-1d5226844a39"),
    ) ?? null,
  };

  const outputPath = path.join(repoRoot, "docs", "display-sync-queue-diagnostic.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
