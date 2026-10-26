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

test("project realignment updates activity event metadata project ids", () => {
  const projects = read("desktop/src/repositories/projects-repository.ts");
  assert.match(projects, /activity_events/);
  assert.match(projects, /json_set\(metadata_json, '\$\.projectId'/);
});

test("activity events repository can repair metadata project ids", () => {
  const repo = read("desktop/src/repositories/activity-events-repository.ts");
  assert.match(repo, /repairMetadataProjectId/);
  assert.match(repo, /updateMetadataProjectId/);
});

test("activity upload authorization uses current authorization context", () => {
  const activity = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(activity, /getAuthorizationContext\(\)/);
  assert.match(activity, /accessibleProjectIds\.includes/);
});

test("cloud activity mapper uses metadata projectId for hosted upload", () => {
  const mapper = read("desktop/src/services/activity-sync/cloud-activity-mapper.ts");
  assert.match(mapper, /project_id: projectId/);
});

test("activity pull accepts package-directory cloud project aliases", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /buildActivityPullProjectScope/);
  assert.match(service, /remapCloudActivityProjectId/);
  assert.match(service, /setProjectDirectoryAliasProvider/);
});

test("activity pull advances cursor from raw page to avoid alias stalls", () => {
  const client = read("desktop/src/services/activity-sync/cloud-activity-client.ts");
  assert.match(client, /pageCursor/);
  assert.match(client, /scanned/);
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /page\.pageCursor/);
  assert.match(service, /ACTIVITY_SYNC_ALIAS_BACKFILL_KEY/);
});

test("activity upload maps to hosted UUID without rewriting local project metadata", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /resolveCloudProjectIdForUpload/);
  assert.match(service, /cloudProjectId/);
  assert.doesNotMatch(service, /updateMetadataProjectId\(activeRecord\.cloudId/);
  const main = read("desktop/src/main.ts");
  assert.match(main, /realignOnSlugConflict: false/);
});
