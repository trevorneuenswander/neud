/**
 * Static checks for NEUD UI corrections:
 * BA Webpage Scraper labels, Manual Controller terminology,
 * SEMA optimistic LIVE bugs, video card controls/settings.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

test("Broad Arrow toggle labels are Webpage Scraper | Manual Controller", () => {
  const options = read("src/lib/displays/display-data-source.ts");
  assert.match(options, /value: "webpage-scraper", label: "Webpage Scraper"/);
  assert.match(options, /value: "local-controller", label: "Manual Controller"/);
  assert.doesNotMatch(options, /label: "Data Source"/);
  assert.doesNotMatch(options, /label: "Local Controller"/);

  const desktop = read("desktop/src/displays/display-data-source.ts");
  assert.match(desktop, /label: "Webpage Scraper"/);
  assert.match(desktop, /label: "Manual Controller"/);

  const resolver = read("src/lib/displays/resolve-effective-display-data.ts");
  assert.match(resolver, /"Webpage Scraper"/);
  assert.match(resolver, /"Manual Controller"/);
});

test("SEMA toggle labels are Data Source | Manual Controller", () => {
  const controls = read("src/components/sema/SemaProjectSourceControls.tsx");
  assert.match(controls, /label: "Data Source"/);
  assert.match(controls, /label: "Manual Controller"/);
  assert.match(controls, /emitSemaSourceMode/);
  assert.match(controls, /postSemaAction/);
});

test("Manual Controller terminology appears in nav and page titles", () => {
  const caps = read("src/lib/projects/capabilities.ts");
  assert.match(caps, /moduleLabel: "Manual Controller"/);

  const nav = read("src/lib/portal/navigation.ts");
  assert.match(nav, /return "Manual Controller"/);

  const ba = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(ba, /title="Manual Controller"/);

  const sema = read("src/components/sema/SemaLocalControllerClient.tsx");
  assert.match(sema, /title="Manual Controller"/);
});

test("SEMA redundant source messages are removed", () => {
  const sheet = read("src/components/sema/SemaGoogleSheetClient.tsx");
  assert.doesNotMatch(sheet, /Local Controller is currently on air/);
  assert.doesNotMatch(sheet, /Selected on-air source:/);

  const controller = read("src/components/sema/SemaLocalControllerClient.tsx");
  assert.doesNotMatch(controller, /Selected on-air source:/);
  assert.doesNotMatch(controller, /saved and taken on air/);
  assert.match(controller, /dirtyFieldClassName/);
  assert.match(controller, /border-warning/);
});

test("SEMA LIVE/OFFLINE pills subscribe to optimistic source events", () => {
  const client = read("src/lib/sema/sema-source-mode-client.ts");
  assert.match(client, /emitSemaSourceMode/);
  assert.match(client, /subscribeToSemaSourceMode/);
  assert.match(client, /applyAuthoritativeSemaSourceMode/);

  const pill = read("src/components/sema/SemaSourceStatusPill.tsx");
  assert.match(pill, /subscribeToSemaSourceMode/);
  assert.match(pill, /getSemaSourceModeSnapshot/);
});

test("video display cards place playback controls after Edit with spacer", () => {
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /ProRes 4444 Video Display/);
  assert.match(card, /Custom HTML Display/);
  assert.match(card, /VideoPlaybackControls/);
  assert.match(card, /variant="card"/);
  assert.match(card, /DisplayEditMenu[\s\S]*VideoPlaybackControls/s);

  const controls = read("src/components/displays/VideoPlaybackControls.tsx");
  assert.match(controls, /api\.video\[action\]/);
  assert.match(controls, /setLoop/);
  assert.match(controls, /Play/);
  assert.match(controls, /Pause/);
  assert.match(controls, /Restart/);
  assert.match(controls, /Stop/);
});

test("video settings omit HTML editing and revisions", () => {
  const edit = read("src/components/displays/DisplayEditClient.tsx");
  assert.match(edit, /isVideoDisplay/);
  assert.match(edit, /ProRes Video/);
  assert.match(edit, /HTML source[\s\S]*editing and revision controls are not available/);
  assert.doesNotMatch(edit, /VideoPlaybackControls/);
  assert.match(edit, /isVideoDisplay \? \(/);

  const menu = read("src/components/displays/DisplayEditMenu.tsx");
  assert.match(menu, /id: "settings"/);
  assert.doesNotMatch(menu, /isVideoDisplay \? \[\][\s\S]*settings/);
});
