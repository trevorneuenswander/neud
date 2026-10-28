#!/usr/bin/env node
/**
 * NEUD v0.3.1 — SEMA Data Source table Highlight workflow refinements.
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

test("display card no longer mounts SemaTickerHighlightPanel", () => {
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.doesNotMatch(card, /SemaTickerHighlightPanel/);
  assert.doesNotMatch(card, /Highlight controls/);
});

test("Local Controller Highlight removes Find event; keeps custom workflow", () => {
  const controls = read("src/components/sema/SemaHighlightControls.tsx");
  assert.doesNotMatch(controls, /Find event/);
  assert.doesNotMatch(controls, /Search title or description/);
  assert.doesNotMatch(controls, /<option value="scheduled">/);
  assert.doesNotMatch(controls, /Select an event/);
  assert.match(controls, /source:\s*"custom"/);
  assert.match(controls, /Activate Highlight|Update Highlight/);
  assert.match(controls, /Remove Highlight/);
  assert.match(controls, /Clear Highlight/);
  assert.match(controls, /Data Source schedule table/);
});

test("Google Sheet Tab sits above schedule table; absent from URL config", () => {
  const ui = read("src/components/sema/SemaGoogleSheetClient.tsx");
  const tabIdx = ui.indexOf("Google Sheet Tab");
  const scheduleIdx = ui.indexOf(">Schedule<");
  const urlIdx = ui.indexOf("URL Configuration");
  assert.ok(tabIdx > 0, "Google Sheet Tab label present");
  assert.ok(scheduleIdx > tabIdx, "Tab control appears before Schedule heading");
  assert.ok(urlIdx > scheduleIdx, "URL Configuration remains after table");

  const urlSection = ui.slice(urlIdx);
  assert.doesNotMatch(urlSection, /Google Sheet Tab/);
  assert.match(urlSection, /Spreadsheet URL or ID/);
  assert.match(urlSection, /Check for changes every/);
});

test("table exposes Activate Highlight | Remove Highlight | Jump with status signifiers", () => {
  const ui = read("src/components/sema/SemaGoogleSheetClient.tsx");
  const activateIdx = ui.indexOf(">Activate Highlight<") >= 0
    ? ui.indexOf(">Activate Highlight<")
    : ui.indexOf("Activate Highlight");
  const removeIdx = ui.indexOf(">Remove Highlight<") >= 0
    ? ui.indexOf(">Remove Highlight<")
    : ui.indexOf("Remove Highlight");
  const jumpIdx = ui.indexOf(">Jump</Button>") >= 0
    ? ui.indexOf(">Jump</Button>")
    : ui.lastIndexOf("\n                Jump\n");
  assert.ok(activateIdx > 0, "Activate Highlight present");
  assert.ok(removeIdx > activateIdx, "Remove Highlight after Activate");
  assert.ok(jumpIdx > removeIdx, "Jump after Remove Highlight");

  assert.match(ui, /text-success/);
  assert.match(ui, />Now</);
  assert.match(ui, /text-primary/);
  assert.match(ui, />Next</);
  assert.match(ui, />Later</);
  assert.match(ui, />Highlight</);
  assert.match(ui, /RowStatusSignifiers/);
  assert.match(ui, /stableRowId === nowRowId/);
  assert.match(ui, /stableRowId === nextRowId/);
  assert.match(ui, /stableRowId === laterRowId/);
  assert.match(ui, /stableRowId === highlightRowId/);
  assert.match(ui, /setSemaHighlight/);
  assert.match(ui, /source:\s*"scheduled"/);
  assert.match(ui, /removeSemaHighlight/);
  assert.match(ui, /selectWorksheet/);
  assert.doesNotMatch(ui, /Highlight activated from selected event/);
  assert.doesNotMatch(ui, /Highlight removed from air\. Prepared fields kept/);
});

test("schedule service auto-removes scheduled Highlight at NEXT/NOW", () => {
  const service = read("desktop/src/packages/sema/sema-schedule-service.ts");
  assert.match(service, /autoRemoveScheduledHighlightIfDue/);
  assert.match(service, /already NEXT/);
  assert.match(service, /already NOW/);
  assert.match(service, /highlight\.source !== "scheduled"/);
  assert.match(service, /live\.next\?\.stableRowId === highlight\.sourceRowId/);
  assert.match(service, /live\.now\?\.stableRowId === highlight\.sourceRowId/);
  assert.match(service, /sourceWorksheetGid/);
});

test("ticker uses advance animation for Highlight later slot", () => {
  const html = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  assert.match(html, /currentHighlightActive/);
  assert.match(html, /highlightToggled/);
  assert.match(html, /slot === "later".*runAdvance|runAdvance\(slot, next, contentEpoch\)/s);
  assert.match(html, /function applyLaterLabel\(schedule\)/);
  assert.match(html, /var text = "LATER"/);
  assert.match(html, /Skip unchanged slots/);
});

test("SEMA package baseline remains v9 compatible", () => {
  const catalog = read("desktop/src/packages/builtin-package-catalog.ts");
  assert.match(catalog, /SEMA_PACKAGE_BASELINE_VERSION\s*=\s*9/);
});
