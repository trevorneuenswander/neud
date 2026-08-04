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

test("local migration 033 is registered for online viewer columns", () => {
  const migrate = read("desktop/src/database/migrate.ts");
  const migration = read("desktop/src/database/migrations/033_display_online_viewer.sql");
  assert.match(migrate, /033_display_online_viewer\.sql/);
  assert.match(migration, /online_viewer_enabled/);
  assert.match(migration, /online_visibility/);
  assert.match(migration, /online_published_at/);
  assert.match(migration, /online_publish_error/);
});

test("online viewer panel renders on display edit route", () => {
  const editClient = read("src/components/displays/DisplayEditClient.tsx");
  const editPage = read("src/app/(portal)/projects/[slug]/displays/[displayId]/edit/page.tsx");
  assert.match(editClient, /OnlineViewerPanel/);
  assert.match(read("src/components/displays/OnlineViewerPanel.tsx"), /Online Viewer/);
  assert.doesNotMatch(read("src/components/displays/OnlineViewerPanel.tsx"), /Enable Online Viewer/);
  assert.doesNotMatch(editClient, /displaySlug \? \(\s*<OnlineViewerPanel/);
  assert.match(editPage, /canManageSettings/);
});

test("compact online viewer status renders on displays list cards", () => {
  const broadArrow = read("src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx");
  const htmlCard = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  const displayCard = read("src/components/displays/DisplayCard.tsx");
  const toggle = read("src/components/displays/OnlineViewerToggle.tsx");

  assert.match(broadArrow, /OnlineViewerToggle/);
  assert.match(htmlCard, /OnlineViewerToggle/);
  assert.match(displayCard, /OnlineViewerToggle/);
  assert.match(broadArrow, /label="Online Viewer"/);
  assert.match(toggle, /Switch/);
});

test("owner and admin manage online viewer via canDeveloperTools", () => {
  const displaysPage = read("src/components/displays/DisplaysPageClient.tsx");
  const toggle = read("src/components/displays/OnlineViewerToggle.tsx");
  assert.match(displaysPage, /canDeveloperTools=\{canManageSettings\}/);
  assert.match(toggle, /canManage/);
});

test("online viewer API route uses project slug and display id", () => {
  const api = read("desktop/src/services/local-api-server.ts");
  const clientApi = read("src/lib/local/online-viewer-api.ts");
  assert.match(api, /\/online-viewer/);
  assert.match(clientApi, /\/displays\/\$\{encodeURIComponent\(displayId\)\}\/online-viewer/);
});

test("online viewer panel stays visible with unavailable states", () => {
  const panel = read("src/components/displays/OnlineViewerPanel.tsx");
  assert.match(panel, /NEUD desktop app|Unable to load online viewer settings/);
  assert.match(panel, /canManage/);
  assert.doesNotMatch(panel, /Online viewing status/);
  assert.doesNotMatch(panel, /Viewer access mode/);
  assert.match(panel, /Online Viewer is currently off for this display/);
  assert.doesNotMatch(panel, /return null/);
  assert.doesNotMatch(panel, /Enable Online Viewer/);
});

test("repository maps online viewer settings to sqlite fields", () => {
  const repo = read("desktop/src/repositories/project-display-code-repository.ts");
  assert.match(repo, /onlineViewerEnabled/);
  assert.match(repo, /online_visibility/);
});
