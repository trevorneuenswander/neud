/**
 * Static acceptance checks for NEUD v0.3.0 source-selection architecture,
 * Displays layout scroll reset, and project-video list/recovery visibility.
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

test("shared on-air toggle is source selection, not navigation", () => {
  const toggle = read("src/components/projects/ProjectOnAirSourceToggle.tsx");
  assert.match(toggle, /Does not navigate/);
  assert.doesNotMatch(toggle, /from "next\/link"|href=/);

  const sema = read("src/components/sema/SemaProjectSourceControls.tsx");
  assert.match(sema, /ProjectOnAirSourceToggle/);
  assert.match(sema, /postSemaAction[\s\S]*"source"/);
  assert.doesNotMatch(sema, /from "next\/link"|<Link/);
  assert.doesNotMatch(sema, /Sheet Live|Controller Live|On air:/);

  const ba = read("src/components/projects/ProjectDataSourceSelector.tsx");
  assert.match(ba, /ProjectOnAirSourceToggle/);
  assert.match(ba, /setDesktopDisplayDataSource/);
  assert.doesNotMatch(ba, /from "next\/link"|router\.push|href=/);

  const options = read("src/lib/displays/display-data-source.ts");
  assert.match(options, /label: "Webpage Scraper"/);
  assert.match(options, /label: "Manual Controller"/);

  const semaOptions = read("src/components/sema/SemaProjectSourceControls.tsx");
  assert.match(semaOptions, /label: "Data Source"/);
  assert.match(semaOptions, /label: "Manual Controller"/);
});

test("page navigation surfaces Live/Offline for selection only", () => {
  const sheet = read("src/components/sema/SemaGoogleSheetClient.tsx");
  assert.match(sheet, /SemaSourceStatusPill/);
  assert.match(sheet, /pageSource="google-sheets"/);
  assert.match(sheet, /do not change the on-air source/);

  const controller = read("src/components/sema/SemaLocalControllerClient.tsx");
  assert.match(controller, /SemaSourceStatusPill/);
  assert.match(controller, /pageSource="manual"/);
  assert.match(controller, /saveManual\(false\)/);
  assert.match(controller, /saveManual\(true\)/);
  assert.match(controller, /Take on air/);
  assert.match(controller, /title="Manual Controller"/);

  const pill = read("src/components/sema/SemaSourceStatusPill.tsx");
  assert.match(pill, /subscribeToSemaSourceMode/);
  assert.match(pill, /ConnectionStatusPill/);

  const baController = read("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(baController, /DataSourceStatusPill/);
  assert.match(baController, /pageSource="local-controller"/);
  assert.match(baController, /title="Manual Controller"/);

  const baScraper = read("src/components/data-engines/EngineDetailClient.tsx");
  assert.match(baScraper, /DataSourceStatusPill/);
  assert.match(baScraper, /pageSource="webpage-scraper"/);
});

test("SEMA advance/jump/save never silently own the source toggle", () => {
  const service = read("desktop/src/packages/sema/sema-schedule-service.ts");
  assert.match(service, /Always move the Google Sheets cache cursor/);
  assert.match(service, /never change sourceMode here/);
  assert.match(service, /takeOnAir === true && current\.sourceMode !== "manual"/);

  const local = read("desktop/src/services/local-data-service.ts");
  assert.match(local, /sheetOnly: true/);
  assert.match(local, /SEMA on-air source switched to Manual Controller/);
  assert.match(local, /SEMA on-air source switched to Data Source/);
  assert.match(local, /assertCanControlSemaProject/);
});

test("Displays layout resets the correct scroll container on route change", () => {
  const layout = read("src/components/projects/ProjectLayoutFrame.tsx");
  assert.match(layout, /useResetProjectContentScroll/);
  assert.match(layout, /frame\.scrollTop = 0/);
  assert.match(layout, /neud-app-content/);
  assert.match(layout, /overscroll-y-contain/);
  assert.match(layout, /project-layout-frame/);

  const preview = read("src/components/displays/DisplayCanvasPreview.tsx");
  assert.match(preview, /tabIndex=\{-1\}/);
});

test("project-video displays list and orphan recovery path", () => {
  const list = read("desktop/src/services/local-data-service.ts");
  assert.match(list, /code\?\.sourceType === "project-video"/);
  assert.match(list, /settings\.sourceType === "project-video"/);

  const page = read("src/app/(portal)/projects/[slug]/displays/page.tsx");
  assert.match(page, /sourceType === "project-video"/);

  const store = read("desktop/src/media/video-media-store.ts");
  assert.match(store, /listOrphanAssets/);
  assert.match(store, /display_id IS NULL/);

  const tools = read("desktop/src/services/developer-tools-service.ts");
  assert.match(tools, /recoverOrphanVideoDisplays/);
  assert.match(tools, /recoveredFromOrphan/);
  assert.match(tools, /this\.videoMedia\.deleteAsset\(asset\.id\)/);

  const ipc = read("desktop/src/ipc/media.ts");
  assert.match(ipc, /neud:media:recoverOrphanVideoDisplays/);

  const client = read("src/components/displays/DisplaysPageClient.tsx");
  assert.match(client, /recoverOrphanVideoDisplays/);
  assert.match(client, /router\.refresh\(\)/);
});
