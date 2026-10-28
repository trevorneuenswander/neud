#!/usr/bin/env node
/**
 * NEUD v0.3.1 — SEMA Remove Highlight, ticker label animation, Sheets tabs, portal visibility.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("Highlight controls expose Activate | Remove | Clear (custom Local Controller)", () => {
  const controls = read("src/components/sema/SemaHighlightControls.tsx");
  assert.match(controls, /Activate Highlight|Update Highlight/);
  assert.match(controls, /Remove Highlight/);
  assert.match(controls, /Clear Highlight/);
  assert.match(controls, /removeSemaHighlight/);
  assert.match(controls, /clearSemaHighlight/);
  assert.doesNotMatch(controls, /Find event/);
  const activateIdx = controls.indexOf("Activate Highlight");
  const removeIdx = controls.indexOf("Remove Highlight");
  const clearIdx = controls.indexOf("Clear Highlight");
  assert.ok(activateIdx > 0 && removeIdx > activateIdx && clearIdx > removeIdx);
});

test("schedule API and local service distinguish remove vs clear", () => {
  const api = read("src/graphics/sema-schedule/schedule-api.ts");
  const service = read("desktop/src/packages/sema/sema-schedule-service.ts");
  const data = read("desktop/src/services/local-data-service.ts");
  const server = read("desktop/src/services/local-api-server.ts");

  assert.match(api, /export function removeSemaHighlight/);
  assert.match(api, /remove:\s*true/);
  assert.match(service, /removeHighlight\(/);
  assert.match(service, /clearHighlight\(/);
  assert.match(service, /highlight_active:\s*0/);
  assert.match(data, /removeSemaHighlight/);
  assert.match(data, /clearSemaHighlight/);
  assert.match(server, /body\.remove === true/);
  assert.match(server, /body\.clear === true/);
});

test("ticker keeps LATER heading and skips unchanged later on advance", () => {
  const html = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  assert.match(html, /function applyLaterLabel\(schedule\)/);
  assert.match(html, /var text = "LATER"/);
  assert.match(html, /currentLaterLabel/);
  assert.match(html, /Skip unchanged slots/);
  assert.match(html, /rowsEqual\(prev, next\)/);
  assert.match(html, /runAdvance\(slot, next, contentEpoch\)/);
});

test("Google Sheets tab discovery and persistence wiring", () => {
  const adapter = read("desktop/src/packages/sema/google-sheets-adapter.ts");
  const service = read("desktop/src/packages/sema/sema-schedule-service.ts");
  const ui = read("src/components/sema/SemaGoogleSheetClient.tsx");
  const api = read("src/graphics/sema-schedule/schedule-api.ts");
  const server = read("desktop/src/services/local-api-server.ts");
  const migration = read("desktop/src/database/migrations/041_sema_schedule_state.sql");

  assert.match(adapter, /listPublicSpreadsheetWorksheets/);
  assert.match(adapter, /parseWorksheetsFromHtml/);
  assert.match(adapter, /extractWorksheetGidFromUrl/);
  assert.match(adapter, /htmlview/);
  assert.match(adapter, /accessMode: "public-csv"/);
  assert.doesNotMatch(adapter, /client_secret|GOOGLE_CLIENT|credentials\.json/i);

  assert.match(service, /listWorksheets/);
  assert.match(service, /sheet_worksheet_gid/);
  assert.match(service, /sheet_worksheet_title/);
  assert.match(migration, /sheet_worksheet_gid/);
  assert.match(migration, /sheet_worksheet_title/);

  assert.match(ui, /Google Sheet Tab/);
  assert.match(ui, /Refresh Tabs/);
  assert.match(ui, /listSemaWorksheets/);
  assert.match(ui, /Activate Highlight/);
  assert.match(api, /worksheets/);
  assert.match(server, /worksheets/);
  const tabIdx = ui.indexOf("Google Sheet Tab");
  const urlIdx = ui.indexOf("URL Configuration");
  assert.ok(tabIdx > 0 && urlIdx > tabIdx);
  assert.doesNotMatch(ui.slice(urlIdx), /Google Sheet Tab/);
});

test("portal listing includes RLS projects and team-admin access resolution", () => {
  const portal = read("src/lib/hosted/portal-queries.ts");
  const queries = read("src/lib/projects/queries.ts");
  const auth = read("src/lib/projects/authorization.ts");

  assert.match(portal, /from\("projects"\)/);
  assert.doesNotMatch(portal, /from\("project_members"\)/);
  assert.match(queries, /get_project_access_level/);
  assert.match(auth, /get_project_access_level/);
  assert.match(auth, /Team Admins inherit/);
});
