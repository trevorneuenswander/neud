#!/usr/bin/env node
/**
 * v0.3.1 — SEMA / multi-project activity sync identity + safety regressions.
 *
 * Covers cloud↔local project ID aliasing that caused Windows to drop SEMA
 * activity while Broad Arrow continued to sync, and asserts that established
 * local project UUIDs are preserved (non-destructive boundary mapping).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

const SEMA_CLOUD_ID = "5e0a0001-0000-4000-8000-000000000001";
const SEMA_LOCAL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const BA_SHARED_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

async function loadAliasesModule() {
  const candidates = [
    path.join(repoRoot, "desktop/dist/services/activity-sync/project-id-aliases.js"),
    path.join(repoRoot, "desktop/src/services/activity-sync/project-id-aliases.ts"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return await import(pathToFileURL(candidate).href);
    } catch {
      // try next
    }
  }
  return null;
}

test("mismatched SEMA local UUID maps both directions without rewriting ids", async () => {
  const mod = await loadAliasesModule();
  assert.ok(mod?.buildActivityPullProjectScope);
  assert.ok(mod?.resolveCloudProjectIdForUpload);
  assert.ok(mod?.remapCloudActivityProjectId);

  const scope = mod.buildActivityPullProjectScope({
    accessibleLocalProjectIds: [SEMA_LOCAL_ID, BA_SHARED_ID],
    directoryEntries: [
      { cloudProjectId: SEMA_CLOUD_ID, localProjectId: SEMA_LOCAL_ID },
      { cloudProjectId: BA_SHARED_ID, localProjectId: BA_SHARED_ID },
      { cloudProjectId: "builtin:other", localProjectId: "not-accessible" },
    ],
  });

  assert.ok(scope.accessibleQueryIds.includes(SEMA_CLOUD_ID));
  assert.ok(scope.accessibleQueryIds.includes(SEMA_LOCAL_ID));
  assert.equal(scope.cloudToLocal.get(SEMA_CLOUD_ID), SEMA_LOCAL_ID);
  assert.equal(scope.localToCloud.get(SEMA_LOCAL_ID), SEMA_CLOUD_ID);
  assert.equal(scope.localToCloud.has(BA_SHARED_ID), false);

  const uploadId = mod.resolveCloudProjectIdForUpload(SEMA_LOCAL_ID, scope.localToCloud);
  assert.equal(uploadId, SEMA_CLOUD_ID);

  const remapped = mod.remapCloudActivityProjectId(
    { projectId: SEMA_CLOUD_ID, projectSlug: "sema" },
    SEMA_CLOUD_ID,
    scope.cloudToLocal,
  );
  assert.equal(remapped.projectId, SEMA_LOCAL_ID);
});

test("new install / aligned SEMA needs no alias; Broad Arrow shared id unchanged", async () => {
  const mod = await loadAliasesModule();
  assert.ok(mod?.buildActivityPullProjectScope);

  const aligned = mod.buildActivityPullProjectScope({
    accessibleLocalProjectIds: [SEMA_CLOUD_ID, BA_SHARED_ID],
    directoryEntries: [
      { cloudProjectId: SEMA_CLOUD_ID, localProjectId: SEMA_CLOUD_ID },
      { cloudProjectId: BA_SHARED_ID, localProjectId: BA_SHARED_ID },
    ],
  });
  assert.equal(aligned.cloudToLocal.size, 0);
  assert.equal(aligned.localToCloud.size, 0);
  assert.equal(aligned.aliasFingerprint, "");
  assert.ok(aligned.accessibleQueryIds.includes(SEMA_CLOUD_ID));
  assert.ok(aligned.accessibleQueryIds.includes(BA_SHARED_ID));
});

test("alias fingerprint changes trigger historical backfill; stable fingerprint does not", async () => {
  const mod = await loadAliasesModule();
  assert.ok(mod?.buildActivityPullProjectScope);

  const mismatched = mod.buildActivityPullProjectScope({
    accessibleLocalProjectIds: [SEMA_LOCAL_ID],
    directoryEntries: [{ cloudProjectId: SEMA_CLOUD_ID, localProjectId: SEMA_LOCAL_ID }],
  });
  const again = mod.buildActivityPullProjectScope({
    accessibleLocalProjectIds: [SEMA_LOCAL_ID],
    directoryEntries: [{ cloudProjectId: SEMA_CLOUD_ID, localProjectId: SEMA_LOCAL_ID }],
  });
  assert.equal(mismatched.aliasFingerprint, again.aliasFingerprint);
  assert.ok(mismatched.aliasFingerprint.length > 0);

  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /ACTIVITY_SYNC_ALIAS_BACKFILL_KEY/);
  assert.match(service, /pull\.alias_backfill_reset/);
  assert.match(service, /aliasFingerprint !== priorAliasFingerprint/);
});

test("activity pull remaps cloud→local; push maps local→cloud without metadata rewrite", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /remapCloudActivityProjectId/);
  assert.match(service, /resolveCloudProjectIdForUpload/);
  assert.match(service, /cloudProjectId/);
  assert.match(service, /push\.cloud_project_mapped/);
  assert.doesNotMatch(service, /updateMetadataProjectId\(activeRecord\.cloudId/);
  assert.match(service, /Intentionally do NOT rewrite local metadata\.projectId/);
});

test("cursor persists per successful page; alias fingerprint after full pull", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /Persist cursor only after the page was processed successfully/);
  assert.match(service, /this\.settings\.set\(ACTIVITY_SYNC_CURSOR_KEY, cursor\)/);
  assert.match(service, /page\.pageCursor/);
  assert.match(service, /page\.scanned/);
  assert.match(service, /pagesProcessed/);
  assert.match(service, /pull\.error/);
  const client = read("desktop/src/services/activity-sync/cloud-activity-client.ts");
  assert.match(client, /CloudActivityPullPage/);
  assert.match(client, /pageCursor/);
});

test("activity sync disables destructive slug realignment", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /realignOnSlugConflict: false/);
  assert.match(main, /must NOT rewrite established local project UUIDs/i);
  assert.doesNotMatch(main, /startup-project-identity/);
  assert.match(main, /startup-activity-sync/);

  const reconcile = read("desktop/src/services/display-sync/hosted-identity-reconciliation.ts");
  assert.match(reconcile, /realignOnSlugConflict/);
  assert.match(reconcile, /Non-destructive: return hosted id/);

  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /realignOnSlugConflict/);
});

test("realignProjectId gaps are documented (SEMA/output/media unsafe)", async () => {
  const mod = await loadAliasesModule();
  assert.ok(mod?.REALIGN_PROJECT_ID_GAPS);
  assert.ok(mod.REALIGN_PROJECT_ID_GAPS.includes("sema_schedule_state"));
  assert.ok(mod.REALIGN_PROJECT_ID_GAPS.includes("output_routes"));
  assert.ok(mod.REALIGN_PROJECT_ID_GAPS.includes("display_media_assets"));

  const realign = read("desktop/src/repositories/projects-repository.ts");
  assert.doesNotMatch(realign, /sema_schedule_state/);
  assert.doesNotMatch(realign, /output_routes/);
  assert.doesNotMatch(realign, /display_media_assets/);
  assert.doesNotMatch(realign, /project_capabilities/);
  assert.doesNotMatch(realign, /project_photo_uploads/);
});

test("mapper accepts cloudProjectId override for upload boundary", () => {
  const mapper = read("desktop/src/services/activity-sync/cloud-activity-mapper.ts");
  assert.match(mapper, /cloudProjectId\?:/);
  assert.match(mapper, /override \?\? metadataProjectId/);
});

test("builtin install may prefer hosted UUID only for new projects", () => {
  const packages = read("desktop/src/packages/project-package-service.ts");
  assert.match(packages, /Prefer the hosted cloud UUID/);
  assert.match(packages, /id: preferredId/);
  const projects = read("desktop/src/repositories/projects-repository.ts");
  assert.match(projects, /Prefer a stable hosted UUID/);
});

test("SEMA cloud seed UUID remains canonical; duplicates use cloud event id", () => {
  const migration = read("supabase/migrations/057_ensure_sema_cloud_project.sql");
  assert.match(migration, /5e0a0001-0000-4000-8000-000000000001/);
  const repo = read("desktop/src/repositories/activity-events-repository.ts");
  assert.match(repo, /upsertFromCloud/);
  assert.match(repo, /cloud_id/);
});

test("no Windows-only activity sync branches were introduced", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  const aliases = read("desktop/src/services/activity-sync/project-id-aliases.ts");
  assert.doesNotMatch(service, /process\.platform|win32|darwin/);
  assert.doesNotMatch(aliases, /process\.platform|win32|darwin/);
});
