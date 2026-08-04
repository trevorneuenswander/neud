#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("display enable persists locally and triggers immediate cloud sync", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const displays = read("desktop/src/repositories/displays-repository.ts");
  assert.match(service, /setDisplayEnabled/);
  assert.match(displays, /sync_status = 'pending'/);
  assert.match(service, /syncNow\?\.\("display-enabled"\)/);
  assert.match(service, /operationType: "display.update"/);
});

test("online viewer toggle queues revision-first sync without setting local published timestamp", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(service, /display\.revision\.create/);
  assert.match(service, /syncNow\?\.\("online-viewer"\)/);
  assert.doesNotMatch(
    service,
    /onlinePublishedAt: nextEnabled \? code\.onlinePublishedAt \?\? now/,
  );
  assert.match(sync, /pushDisplayBaseMetadata/);
  assert.match(sync, /pushPendingRevisions/);
  assert.match(sync, /pushDisplayPublicationMetadata/);
});

test("1 base display metadata can sync before revision pointer", () => {
  const mapper = read("desktop/src/services/display-sync/cloud-display-mapper.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(mapper, /publicationPhase/);
  assert.match(mapper, /publicationPhase === "publish"/);
  assert.match(sync, /publicationPhase: "base"/);
  assert.match(sync, /pushDisplayBaseMetadata/);
});

test("2 revisions upload individually with per-row error handling", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  const client = read("desktop/src/services/display-sync/cloud-display-client.ts");
  assert.match(sync, /upsertRevision\(row\)/);
  assert.match(sync, /continuedToNextRow/);
  assert.match(client, /async upsertRevision/);
});

test("3 published pointer is set only after revision upload and cloud confirmation", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /revisionReady = await this\.cloudClient\.revisionExists/);
  assert.match(sync, /publicationPhase: "publish"/);
  assert.match(sync, /published_pointer_not_confirmed/);
});

test("4 local onlinePublishedAt is not set before cloud success", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.doesNotMatch(service, /onlinePublishedAt: nextEnabled \? code\.onlinePublishedAt \?\?/);
  assert.match(sync, /confirmLocalPublishedState/);
  assert.match(sync, /onlinePublishedAt: publishedAt/);
});

test("5 revision failure sets local publish error without blocking other rows", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /setOnlinePublishError/);
  assert.match(sync, /revision_not_ready/);
  assert.match(sync, /continue;/);
});

test("6 one failed pending row does not block others", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /if \(!continued\) \{[\s\S]*continue;/);
  assert.match(sync, /markSyncFailed\(display\.id/);
  assert.match(sync, /markSynced\(display\.id/);
});

test("7 pending queue drains and marks display operations synced after success", () => {
  const queue = read("desktop/src/repositories/display-sync-queue-repository.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(queue, /markSyncedForEntityOperations/);
  assert.match(queue, /deduplicatePending/);
  assert.match(sync, /markSyncedForEntityOperations/);
  assert.match(sync, /listEligibleRevisionCreates/);
});

test("8 duplicate pending operations coalesce on enqueue", () => {
  const queue = read("desktop/src/repositories/display-sync-queue-repository.ts");
  assert.match(queue, /findPendingDuplicate/);
  assert.match(queue, /deduplicatePending/);
});

test("9 immediate and periodic sync use single-flight follow-up guard", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /syncFollowUpRequested/);
  assert.match(sync, /if \(this\.syncInProgress\)/);
  assert.match(sync, /syncNow\("follow-up"\)/);
});

test("10 identity-realigned revisions retain correct project and display ids", () => {
  const reconciliation = read(
    "desktop/src/services/display-sync/hosted-identity-reconciliation.ts",
  );
  const displays = read("desktop/src/repositories/displays-repository.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(reconciliation, /realignDisplayId/);
  assert.match(displays, /UPDATE project_code_revisions/);
  assert.match(sync, /repairPayloadProjectId/);
});

test("11 cloud sync version catches up via per-display publication upsert", () => {
  const mapper = read("desktop/src/services/display-sync/cloud-display-mapper.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(mapper, /sync_version: input\.display\.syncVersion/);
  assert.match(sync, /fetchDisplayById/);
});

test("12 portal listing eligibility requires confirmed published revision", () => {
  const migration = read("supabase/migrations/025_display_online_viewer_eligibility.sql");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(migration, /online_published_revision_id is not null/);
  assert.match(sync, /published_revision_not_confirmed/);
});

test("13 disable removes cloud eligibility immediately via publish row", () => {
  const mapper = read("desktop/src/services/display-sync/cloud-display-mapper.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(mapper, /onlineViewerEnabled/);
  assert.match(sync, /onlinePublishedRevisionId: null/);
});

test("14 viewer-role write remains denied for display revisions", () => {
  const migration = read("supabase/migrations/019_desktop_authenticated_cloud_auth.sql");
  assert.match(migration, /display_revisions_insert[\s\S]*can_operate_project/);
  assert.match(migration, /display_revisions_update[\s\S]*can_operate_project/);
  assert.match(migration, /display_revisions_select[\s\S]*can_view_project/);
});

test("typed and generic displays share cloud mapper contract", () => {
  const mapper = read("desktop/src/services/display-sync/cloud-display-mapper.ts");
  const broadArrow = read("src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx");
  const generic = read("src/components/displays/DisplayCard.tsx");
  assert.match(mapper, /online_viewer_enabled/);
  assert.match(broadArrow, /localSetDeveloperDisplayEnabled/);
  assert.match(generic, /useOnlineViewerSettings/);
});

test("hosted identity reconciliation aligns project and display ids by slug", () => {
  const reconciliation = read(
    "desktop/src/services/display-sync/hosted-identity-reconciliation.ts",
  );
  const projects = read("desktop/src/repositories/projects-repository.ts");
  const displays = read("desktop/src/repositories/displays-repository.ts");
  assert.match(reconciliation, /slug_conflict/);
  assert.match(reconciliation, /realignProjectId/);
  assert.match(reconciliation, /realignDisplayId/);
  assert.match(projects, /realignProjectId/);
  assert.match(displays, /realignDisplayId/);
});

test("display sync surfaces PostgREST error codes and publish failures", () => {
  const client = read("desktop/src/services/display-sync/cloud-display-client.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(client, /codes:/);
  assert.match(sync, /markSyncFailed/);
  assert.match(sync, /lastCloudErrorCode/);
});

test("broad arrow startup reconciles local displays for cloud push", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /reconcileLocalDisplays\(\[broadArrowProject\.id\]\)/);
});

test("diagnose script checks tracked migration filenames exactly", () => {
  const diagnose = read("scripts/live-validation/diagnose-broad-arrow-online.mjs");
  const migrations = read("scripts/live-validation/lib/migrations.mjs");
  assert.match(diagnose, /025_display_online_viewer_eligibility\.sql/);
  assert.match(diagnose, /024_display_online_viewer\.sql/);
  assert.match(diagnose, /isMigrationApplied/);
  assert.match(migrations, /_neud_validation_migrations/);
  assert.doesNotMatch(diagnose, /schema_migrations/);
});

test("diagnose compares local sqlite and hosted cloud display state with queue summary", () => {
  const diagnose = read("scripts/live-validation/diagnose-broad-arrow-online.mjs");
  const localDb = read("scripts/live-validation/lib/local-neud-db.mjs");
  assert.match(localDb, /pendingDisplayRows/);
  assert.match(localDb, /selectedRevisionExistsLocally/);
  assert.match(diagnose, /pendingRevisionRows/);
  assert.match(diagnose, /lastRevisionSyncError/);
  assert.match(diagnose, /revisionExistsInCloud/);
  assert.doesNotMatch(diagnose, /console\.log\(.*serviceRole/i);
});

test("display sync includes structured development logging without secrets", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /\[DisplaySync\] row/);
  assert.match(sync, /\[DisplaySync\] revision_attempt/);
  assert.match(sync, /stream-bid-display/);
  assert.doesNotMatch(sync, /html_content/);
  assert.doesNotMatch(sync, /access_token/);
});
