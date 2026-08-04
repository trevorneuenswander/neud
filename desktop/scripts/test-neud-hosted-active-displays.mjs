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

test("formatActiveDisplayCount handles zero, singular, and plural labels", () => {
  const formatter = read("src/lib/hosted/format-active-display-count.ts");
  assert.match(formatter, /No Active Displays/);
  assert.match(formatter, /1 Active Display/);
  assert.match(formatter, /Active Displays/);
});

test("projects page uses grouped count RPC and navigates to project displays", () => {
  const page = read("src/app/portal/projects/page.tsx");
  const queries = read("src/lib/hosted/portal-queries.ts");
  assert.match(page, /getHostedAccessibleProjectsWithCounts/);
  assert.match(page, /formatActiveDisplayCount/);
  assert.match(page, /HOSTED_PORTAL_PATHS\.projectDisplays\(project\.slug\)/);
  assert.match(queries, /count_active_displays_for_projects/);
  assert.match(queries, /p_project_ids: projects\.map/);
});

test("displays page lists all active displays through list_project_active_displays", () => {
  const page = read("src/app/portal/projects/[slug]/displays/page.tsx");
  const queries = read("src/lib/hosted/portal-queries.ts");
  assert.match(page, /getHostedProjectPortalSummary/);
  assert.match(page, /HostedProjectDisplaysClient/);
  assert.match(queries, /list_project_active_displays/);
  assert.match(page, /All active displays/);
});

test("display card places status and helper text beside action buttons", () => {
  const card = read("src/components/hosted/HostedDisplayCard.tsx");
  assert.match(card, /items-end gap-1 text-right[\s\S]*runtimeHelperText/);
  assert.match(card, /canOpenFullscreen/);
});

test("display card builds fullscreen path from published revision availability", () => {
  const card = read("src/components/hosted/HostedDisplayCard.tsx");
  assert.match(card, /publishedViewerEligible/);
  assert.match(card, /online_published_revision_id/);
  assert.match(card, /resolvedStatus\.canOpenViewer/);
});

test("project displays page polls active display metadata without refresh", () => {
  const client = read("src/components/hosted/HostedProjectDisplaysClient.tsx");
  const hook = read("src/lib/hosted/use-hosted-project-display-list-poll.ts");
  assert.match(client, /useHostedProjectDisplayListPoll/);
  assert.match(hook, /list_project_active_displays/);
  assert.match(hook, /statusChangedWithoutReload/);
});

test("hosted viewer applies legacy adapters at prepare time", () => {
  const document = read("src/lib/developer-tools/display-document.ts");
  const adapters = read("src/lib/developer-tools/hosted-legacy-display-adapters.ts");
  assert.match(document, /applyHostedLegacyDisplayAdapters/);
  assert.match(adapters, /LEGACY_TICKER_LIVE_BRIDGE_SCRIPT/);
  assert.match(adapters, /LEGACY_PYLON_LIVE_BRIDGE_SCRIPT/);
});

test("display cards expose connectivity and visibility badges only", () => {
  const card = read("src/components/hosted/HostedDisplayCard.tsx");
  assert.match(card, /resolvedStatus\.connectivityLabel/);
  assert.match(card, /visibility === "public" \? "Public" : "Private"/);
  assert.match(card, /resolveHostedDisplayStatus/);
  assert.doesNotMatch(card, /Online Viewer:/);
  assert.doesNotMatch(card, /label:\s*"Offline"/);
});

test("display card actions disable copy and fullscreen when viewer is unavailable", () => {
  const card = read("src/components/hosted/HostedDisplayCard.tsx");
  assert.match(card, /resolvedStatus\.canCopyUrl/);
  assert.match(card, /resolvedStatus\.canOpenViewer/);
  assert.match(card, /runtimeHelperText/);
  assert.match(card, /lazyMount/);
  assert.match(card, /HostedDisplayViewerClient/);
});

test("display list diagnostics track active, online viewer, published, and disabled counts", () => {
  const queries = read("src/lib/hosted/portal-queries.ts");
  assert.match(queries, /displayListDiagnostics/);
  assert.match(queries, /totalActiveDisplays/);
  assert.match(queries, /onlineViewerEnabledCount/);
  assert.match(queries, /publishedCount/);
  assert.match(queries, /disabledCount/);
});

test("hosted display status uses connected and disconnected labels", () => {
  const status = read("src/lib/hosted/hosted-display-status.ts");
  const connection = read("src/lib/hosted/hosted-display-connection-status.ts");
  assert.match(status, /label: "Connected"/);
  assert.match(status, /label: "Disconnected"/);
  assert.match(connection, /No active desktop publisher is connected/);
  assert.doesNotMatch(status, /label:\s*"Offline"/);
});
