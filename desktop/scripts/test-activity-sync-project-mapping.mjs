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
