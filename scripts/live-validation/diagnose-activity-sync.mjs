#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRepoRoot,
  loadLiveValidationEnv,
} from "./lib/env.mjs";
import { readLocalBroadArrowState } from "./lib/local-neud-db.mjs";
import { createLiveValidationDbClient } from "./lib/rpc-schema-probe.mjs";
import { isMigrationApplied } from "./lib/migrations.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

const MIGRATION_049 = "049_display_enabled_activity_events.sql";
const MIGRATION_050 = "050_activity_sync_allowlist_extensions.sql";

const repoRoot = getRepoRoot(import.meta.url);
loadLiveValidationEnv(repoRoot);

function extractEventTypeFromSyncError(message) {
  if (!message) {
    return null;
  }
  const match = String(message).match(/event_type=([^\s)]+)/);
  return match?.[1] ?? null;
}

async function main() {
  let pgClient;
  try {
    pgClient = await createLiveValidationDbClient();
  } catch (error) {
    console.error(sanitizeError(error).message);
    process.exit(1);
  }

  try {
    const migration049Applied = await isMigrationApplied(pgClient, MIGRATION_049);
    const migration050Applied = await isMigrationApplied(pgClient, MIGRATION_050);
    const localState = await readLocalBroadArrowState(repoRoot);

    const pendingActivityEvents = localState.pendingActivityEvents ?? [];
    const emittedEventTypeCount = new Set(
      pendingActivityEvents.map((entry) => entry.eventType),
    ).size;

    const rejectedEventTypes = [
      ...new Set(
        pendingActivityEvents
          .filter(
            (entry) =>
              entry.syncError?.includes("not allowed") ||
              entry.syncError?.includes("forbidden") ||
              entry.syncError?.includes("event_type="),
          )
          .map(
            (entry) =>
              entry.eventType ?? extractEventTypeFromSyncError(entry.syncError),
          )
          .filter(Boolean),
      ),
    ];

    const allowlistSource = fs.readFileSync(
      path.join(repoRoot, "src/lib/activity/sync-allowlist.ts"),
      "utf8",
    );
    const localAllowedEventTypes = [
      ...allowlistSource.matchAll(/"([^"]+)"/g),
    ]
      .map((match) => match[1])
      .filter((value) => value.includes(".") || value.includes("-"));

    const allowlistMismatchCount = rejectedEventTypes.filter(
      (type) => !localAllowedEventTypes.includes(type),
    ).length;

    const recoverableFailedCount = pendingActivityEvents.filter(
      (entry) =>
        entry.syncStatus === "failed" &&
        localAllowedEventTypes.includes(entry.eventType) &&
        (entry.syncError?.includes("not allowed") ||
          entry.syncError?.includes("forbidden") ||
          entry.syncError?.includes("event_type=")),
    ).length;

    const unrecoverableFailedCount = pendingActivityEvents.filter(
      (entry) => entry.syncStatus === "failed",
    ).length - recoverableFailedCount;

    const summary = {
      migration049Applied,
      migration050Applied,
      emittedEventTypeCount,
      rejectedEventTypes,
      localAllowedEventTypesCount: localAllowedEventTypes.length,
      cloudAllowedEventTypesCount: migration050Applied
        ? localAllowedEventTypes.length
        : migration049Applied
          ? "partial-049"
          : "legacy-pre-049",
      allowlistMismatchCount,
      recoverableFailedCount,
      unrecoverableFailedCount,
      pendingActivityEventCount: pendingActivityEvents.length,
      lastActivityEventType: localState.lastActivityEvent?.eventType ?? null,
      lastActivitySyncResult: localState.lastActivityEvent?.syncStatus ?? null,
      lastActivitySyncError: localState.lastActivityEvent?.syncError ?? null,
      firstActivitySyncFailureStage:
        rejectedEventTypes.length > 0 ? "event_not_allowlisted" : "none",
    };

    const outputPath = path.join(repoRoot, "docs", "activity-sync-diagnostic.json");
    fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(summary, null, 2));
    console.log(`\nWrote ${outputPath}`);
  } finally {
    await pgClient.end();
  }
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
