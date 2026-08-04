#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  getQueueEligibility,
  summarizeQueueRows,
} from "../../scripts/live-validation/lib/display-sync-queue-inspection.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("1 fresh pending revision with attempt_count 0 is eligible", () => {
  const eligibility = getQueueEligibility({
    syncState: "pending",
    attemptCount: 0,
    lastAttemptAt: null,
  });
  assert.equal(eligibility.eligibleNow, true);
  assert.equal(eligibility.exclusionReason, null);
});

test("2 null lastAttemptAt on pending rows is eligible", () => {
  const queue = read("desktop/src/repositories/display-sync-queue-repository.ts");
  assert.match(queue, /lastAttemptAt/);
  const eligibility = getQueueEligibility({
    syncState: "pending",
    attemptCount: 0,
    lastAttemptAt: null,
  });
  assert.equal(eligibility.eligibleNow, true);
});

test("3 revision operation naming matches enqueue and dequeue paths", () => {
  const queue = read("desktop/src/repositories/display-sync-queue-repository.ts");
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(queue, /display\.revision\.create/);
  assert.match(service, /operationType: "display\.revision\.create"/);
  assert.match(service, /entityType: "display_revision"/);
});

test("4 revision creates use dedicated SQL query instead of display row starvation", () => {
  const queue = read("desktop/src/repositories/display-sync-queue-repository.ts");
  assert.match(queue, /listPendingRevisionCreates/);
  assert.match(queue, /operation_type = 'display\.revision\.create'/);
  assert.match(queue, /listEligibleRevisionCreates/);
});

test("5 identity-reconciled queue rows repair payload display ids", () => {
  const queue = read("desktop/src/repositories/display-sync-queue-repository.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(queue, /repairPayloadDisplayId/);
  assert.match(sync, /repairPayloadDisplayId/);
  assert.match(sync, /realignedDisplayIds/);
});

test("6 pending revisions are attempted outside display pending loop", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /collectDisplaySyncTargets/);
  assert.match(sync, /listEligibleRevisionCreates/);
  assert.doesNotMatch(sync, /while \(pendingDisplays\.length > 0[\s\S]*pushPendingRevisions/);
});

test("7 attempt count increments on actual revision attempt", () => {
  const queue = read("desktop/src/repositories/display-sync-queue-repository.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(queue, /recordAttempt/);
  assert.match(sync, /this\.queue\.recordAttempt\(entry\.id\)/);
});

test("8 revision success still precedes publication metadata phase", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  const revisionIndex = sync.indexOf("pushPendingRevisions");
  const publishIndex = sync.indexOf("pushDisplayPublicationMetadata");
  assert.ok(revisionIndex >= 0 && publishIndex > revisionIndex);
  assert.match(sync, /revisionExists\(targetRevisionId\)/);
});

test("9 unattempted eligible work prevents success result", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /resolveSyncPassResult/);
  assert.match(sync, /remainingEligible > 0/);
  assert.match(sync, /return "partial"/);
});

test("10 partial result reports remaining pending work", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  const types = read("desktop/src/services/display-sync/types.ts");
  assert.match(types, /remainingEligible/);
  assert.match(sync, /persistPassResult/);
  assert.match(sync, /DISPLAY_SYNC_LAST_PASS_RESULT_KEY/);
});

test("11 duplicate display operations coalesce without removing revision work", () => {
  const queue = read("desktop/src/repositories/display-sync-queue-repository.ts");
  assert.match(queue, /deduplicatePending/);
  assert.match(queue, /`\$\{entry\.operationType\}:\$\{entry\.entityType\}:\$\{entry\.entityId\}`/);
});

test("12 queue inspection diagnostic reports exclusion reasons", () => {
  const script = read("scripts/live-validation/diagnose-display-sync-queue.mjs");
  const inspection = read("scripts/live-validation/lib/display-sync-queue-inspection.mjs");
  assert.match(script, /summarizeQueueRows/);
  assert.match(script, /pendingItems/);
  assert.match(inspection, /exclusionReason/);
  assert.match(inspection, /eligibleNow/);
  assert.match(inspection, /delayed_retry/);
});

test("13 online viewer flag stays false until publish phase confirms revision", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /onlineViewerEnabled && targetRevisionId/);
  assert.match(sync, /published_pointer_not_confirmed/);
  assert.match(sync, /online_published_revision_id !== targetRevisionId/);
});

test("14 summarizeQueueRows marks stream bid revision items safely", () => {
  const summary = summarizeQueueRows(
    [
      {
        id: "queue-1",
        entityType: "display_revision",
        entityId: "4889d79c-7355-4171-a196-1d5226844a39",
        operationType: "display.revision.create",
        payload: { projectId: "proj-1", displayId: "disp-1" },
        createdAt: "2026-07-31T12:00:00.000Z",
        attemptCount: 0,
        lastAttemptAt: null,
        lastError: null,
        syncState: "pending",
        sourceInstanceId: "instance-1",
      },
    ],
    new Map([["disp-1", "stream-bid-display"]]),
  );
  assert.equal(summary.pendingRevisionRows, 1);
  assert.equal(summary.items[0]?.displaySlug, "stream-bid-display");
  assert.equal(summary.items[0]?.eligibleNow, true);
});

test("diagnose command exists in package scripts", () => {
  const pkg = read("package.json");
  assert.match(pkg, /diagnose:display-sync-queue/);
});
