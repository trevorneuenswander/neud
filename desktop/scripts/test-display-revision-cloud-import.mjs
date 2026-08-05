#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("cloud import matches hosted revision ID before version number", () => {
  const importer = readSrc("desktop/src/services/display-sync/display-revision-cloud-import.ts");
  assert.match(importer, /getById\(input\.revision\.id\)/);
  assert.match(importer, /findByResourceAndSourceHash/);
  assert.match(importer, /findByResourceAndVersionNumber/);
});

test("bundled v1 reconciles to hosted v1 when content hash matches", () => {
  const importer = readSrc("desktop/src/services/display-sync/display-revision-cloud-import.ts");
  assert.match(importer, /bundled_v1_hosted_v1_identical/);
  assert.match(importer, /reconcileRevisionIdentity/);
  assert.match(importer, /isLocalBundledRevision/);
});

test("same version different content preserves both revisions", () => {
  const importer = readSrc("desktop/src/services/display-sync/display-revision-cloud-import.ts");
  assert.match(importer, /reassignVersionNumber/);
  assert.match(importer, /conflict_preserved/);
  assert.match(importer, /same_version_different_content/);
});

test("pull handles each revision independently without aborting the display", () => {
  const pull = readSrc("desktop/src/services/display-sync/display-sync-pull.ts");
  assert.match(pull, /for \(const revision of cloudRevisions\)/);
  assert.match(pull, /pull\.revision\.error/);
  assert.match(pull, /formatRevisionConflictDiagnostic/);
  assert.doesNotMatch(pull, /importCloudRevision\([\s\S]*catch[\s\S]*throw/);
});

test("pull logs structured conflict diagnostics", () => {
  const importer = readSrc("desktop/src/services/display-sync/display-revision-cloud-import.ts");
  assert.match(importer, /pull\.conflict\.detail/);
  assert.match(importer, /collisionType=/);
  assert.match(importer, /hostedRevisionId=/);
  assert.match(importer, /localVersion=/);
});

test("pull logs per-display revision counts", () => {
  const pull = readSrc("desktop/src/services/display-sync/display-sync-pull.ts");
  assert.match(pull, /pull\.display\.complete/);
  assert.match(pull, /hostedRevisionCount=/);
  assert.match(pull, /localRevisionCountBefore=/);
  assert.match(pull, /localRevisionCountAfter=/);
  assert.match(pull, /publishedApplied=/);
});

test("published revision pull does not overwrite pending local activation", () => {
  const pull = readSrc("desktop/src/services/display-sync/display-sync-pull.ts");
  const devTools = readSrc("desktop/src/services/developer-tools-service.ts");
  assert.match(pull, /hasPendingActiveRevisionPush/);
  assert.match(pull, /pending_local_active_revision_push/);
  assert.match(devTools, /display\.active_revision\.update/);
  assert.match(devTools, /display-version-activated/);
});

test("activating a display version marks display sync pending and pushes", () => {
  const devTools = readSrc("desktop/src/services/developer-tools-service.ts");
  const activateBlock = devTools.slice(
    devTools.indexOf("setActiveDisplayRevision("),
    devTools.indexOf("renameDisplayRevision("),
  );
  assert.match(activateBlock, /publishedRevisionId: revisionId/);
  assert.match(activateBlock, /markSyncPending/);
  assert.match(activateBlock, /display\.active_revision\.update/);
  assert.match(activateBlock, /syncNow\?\.\("display-version-activated"\)/);
});

test("repository supports identity reconciliation and cloud insert", () => {
  const repo = readSrc("desktop/src/repositories/project-code-revisions-repository.ts");
  assert.match(repo, /reconcileRevisionIdentity/);
  assert.match(repo, /insertCloudRevision/);
  assert.match(repo, /findByResourceAndVersionNumber/);
  assert.match(repo, /reassignVersionNumber/);
});

test("display revision list supports full histories", () => {
  const devTools = readSrc("desktop/src/services/developer-tools-service.ts");
  assert.match(devTools, /limit: input\.resourceType === "display" \? 500 : 50/);
});

test("cloud display client paginates revision fetch across all pages", () => {
  const client = readSrc("desktop/src/services/display-sync/cloud-display-client.ts");
  assert.match(client, /DISPLAY_REVISION_PAGE_SIZE/);
  assert.match(client, /fetchAllRevisionsForDisplays/);
  assert.match(client, /\.range\(from, to\)/);
  assert.match(client, /while \(true\)/);
  assert.match(client, /pageCount/);
});

test("pull merges historical revisions from duplicate hosted display IDs", () => {
  const pull = readSrc("desktop/src/services/display-sync/display-sync-pull.ts");
  assert.match(pull, /pull\.display\.identity/);
  assert.match(pull, /fetchDisplaysBySlugInProject/);
  assert.match(pull, /fetchDisplaysBySlug/);
  assert.match(pull, /includeDeleted: true/);
  assert.match(pull, /fetchAllRevisionsForDisplays/);
  assert.match(pull, /revisionCountsByDisplay/);
  assert.match(pull, /sourceDisplayIds/);
});

test("display sync retries after transient auth refresh failure", () => {
  const sync = readSrc("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /session_refresh_failed_transient/);
  assert.match(sync, /sync\.resumed/);
  assert.match(sync, /scheduleRetry\(\)/);
  assert.match(sync, /refresh_failed/);
});

test("auth refresh logs diagnostics and resumes cloud session", () => {
  const session = readSrc("desktop/src/services/supabase-user-session.ts");
  const coordinator = readSrc("desktop/src/services/authenticated-cloud-coordinator.ts");
  assert.match(session, /auth\.refresh\.begin/);
  assert.match(session, /auth\.refresh\.complete/);
  assert.match(session, /auth\.refresh\.retry/);
  assert.match(session, /session\.updated reason=token-refresh/);
  assert.match(session, /notifySessionStored\("token-refresh"\)/);
  assert.match(coordinator, /set_session_failed/);
  assert.match(coordinator, /session_refresh_failed_transient/);
});

test("active revision push and pull logging is present", () => {
  const sync = readSrc("desktop/src/services/display-sync/display-sync-service.ts");
  const pull = readSrc("desktop/src/services/display-sync/display-sync-pull.ts");
  assert.match(sync, /display\.active_revision\.local/);
  assert.match(sync, /display\.active_revision\.push\.begin/);
  assert.match(sync, /display\.active_revision\.push\.complete/);
  assert.match(pull, /display\.active_revision\.pull\.applied/);
  assert.match(pull, /pending_local_active_revision_push/);
});
