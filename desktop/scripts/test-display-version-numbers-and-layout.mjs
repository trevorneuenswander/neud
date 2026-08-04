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

test("migration adds persisted version_number with backfill and unique index", () => {
  const migration = readSrc(
    "desktop/src/database/migrations/027_display_revision_version_number.sql",
  );
  const migrate = readSrc("desktop/src/database/migrate.ts");
  assert.match(migration, /ADD COLUMN version_number INTEGER/);
  assert.match(migration, /ROW_NUMBER\(\) OVER/);
  assert.match(migration, /ORDER BY created_at ASC, id ASC/);
  assert.match(migration, /idx_display_revision_version_number/);
  assert.match(migrate, /027_display_revision_version_number\.sql/);
});

test("repository assigns next display version number on create", () => {
  const repo = readSrc("desktop/src/repositories/project-code-revisions-repository.ts");
  assert.match(repo, /getNextDisplayVersionNumber/);
  assert.match(repo, /COALESCE\(MAX\(version_number\), 0\)/);
  assert.match(repo, /version_number/);
});

test("list revisions and summaries use persisted versionNumber", () => {
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  const summariesBlock = service.slice(
    service.indexOf("listDisplayVersionSummaries("),
    service.indexOf("listDisplays("),
  );
  assert.match(summariesBlock, /activeRevision\?\.versionNumber/);
  assert.doesNotMatch(summariesBlock, /versionMap\.get/);
  assert.match(service, /versionNumber: revision\.versionNumber/);
});

test("displays page badge shows compact v labels", () => {
  const badge = readSrc("src/components/displays/DisplayVersionBadge.tsx");
  const labels = readSrc("src/lib/displays/display-version-format.ts");
  assert.match(labels, /formatDisplayVersion/);
  assert.match(badge, /formatDisplayVersion/);
  assert.match(badge, /DISPLAY_VERSION_UNAVAILABLE_LABEL/);
});

test("edit display page removes active version box and restores display name", () => {
  const editClient = readSrc("src/components/displays/DisplayEditClient.tsx");
  assert.doesNotMatch(editClient, /Current Active Version/);
  assert.match(editClient, /Display Name/);
  assert.match(editClient, /name: trimmedName/);
  assert.match(editClient, /Save Details/);
  const nameIndex = editClient.indexOf("Display Name");
  const descriptionIndex = editClient.indexOf(">Description<");
  assert.ok(nameIndex > 0);
  assert.ok(descriptionIndex > nameIndex || editClient.indexOf("font-medium text-foreground\">Description") > nameIndex);
});

test("saved versions show separate version number and description", () => {
  const versionList = readSrc("src/components/developer-tools/DisplayVersionList.tsx");
  assert.match(versionList, /formatDisplayVersion/);
  assert.match(versionList, /resolveVersionDescription/);
  assert.match(versionList, /resolveRevisionVersionNumber/);
  assert.doesNotMatch(versionList, /buildRevisionVersionMap/);
});

test("management preview iframe background is transparent", () => {
  const preview = readSrc("src/components/displays/DisplayCanvasPreview.tsx");
  assert.match(preview, /bg-transparent/);
  assert.match(preview, /backgroundColor: "transparent"/);
});

test("local URL output route is transparent without viewer chrome", () => {
  const output = readSrc("src/components/displays/broad-arrow/HtmlDisplayOutputView.tsx");
  const card = readSrc("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /buildProjectDisplayOutputPath/);
  assert.match(output, /background:\s*"transparent"/);
  assert.doesNotMatch(output, /DisplayViewerScaledCanvas/);
});

test("view fullscreen viewer keeps white outer background", () => {
  const liveView = readSrc("src/components/displays/broad-arrow/HtmlDisplayLiveView.tsx");
  const manager = readSrc("desktop/src/services/display-preview-window-manager.ts");
  assert.match(liveView, /backgroundColor: "#ffffff"/);
  assert.match(manager, /backgroundColor: "#ffffff"/);
});

test("fullscreen viewer uses display dimensions for canvas and window sizing", () => {
  const liveView = readSrc("src/components/displays/broad-arrow/HtmlDisplayLiveView.tsx");
  const canvas = readSrc("src/components/displays/DisplayViewerScaledCanvas.tsx");
  const manager = readSrc("desktop/src/services/display-preview-window-manager.ts");
  const card = readSrc("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(liveView, /DisplayViewerScaledCanvas/);
  assert.match(liveView, /displayWidth={displayWidth}/);
  assert.match(canvas, /transform: `scale\(\$\{scale\}\)`/);
  assert.match(canvas, /ResizeObserver/);
  assert.match(canvas, /computeDisplayViewerScale/);
  assert.match(manager, /resolveDisplayWindowBounds/);
  assert.match(manager, /displayWidth/);
  assert.match(card, /displayWidth,\s*\n\s*displayHeight/);
});

test("save as new version does not expose editable version number", () => {
  const dialog = readSrc("src/components/developer-tools/PublishRevisionDialog.tsx");
  const editClient = readSrc("src/components/displays/DisplayEditClient.tsx");
  assert.match(editClient, /revisionNameLabel="Description"/);
  assert.match(editClient, /hideChangeNote/);
  assert.doesNotMatch(dialog, /version number/i);
});

test("rename description API does not change version number field", () => {
  const repo = readSrc("desktop/src/repositories/project-code-revisions-repository.ts");
  const renameBlock = repo.slice(
    repo.indexOf("updateRevisionName("),
    repo.indexOf("export class ProjectValidationLogsRepository"),
  );
  assert.match(renameBlock, /SET revision_name = \?/);
  assert.doesNotMatch(renameBlock, /version_number/);
});
