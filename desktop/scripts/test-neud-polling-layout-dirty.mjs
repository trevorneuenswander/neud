import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("successful poll interval change records activity with readable durations", () => {
  const service = readSrc("desktop/src/services/local-data-service.ts");
  const formatter = readSrc("desktop/src/services/poll-interval-format.ts");
  assert.match(service, /scraper_polling_interval_changed/);
  assert.match(service, /previousPollIntervalMs !== null/);
  assert.match(service, /input\.pollIntervalMs !== previousPollIntervalMs/);
  assert.match(service, /formatPollingInterval/);
  assert.match(formatter, /export function formatPollingInterval/);
  assert.match(formatter, /1 second/);
  assert.match(formatter, /1 minute/);
  assert.match(formatter, /1 hour/);
});

test("poll interval activity is skipped when value is unchanged", () => {
  const service = readSrc("desktop/src/services/local-data-service.ts");
  assert.match(service, /input\.pollIntervalMs !== previousPollIntervalMs/);
});

test("layout uses project root with page scroll below project navigation", () => {
  const frame = readSrc("src/components/projects/ProjectLayoutFrame.tsx");
  const appShell = readSrc("src/components/portal/AppShell.tsx");
  const globals = readSrc("src/app/globals.css");
  assert.match(frame, /project-layout-root/);
  assert.match(frame, /project-layout-frame min-h-0 flex-1 overflow-y-auto/);
  assert.match(frame, /pt-6/);
  assert.match(appShell, /portal-scroll-region/);
  assert.match(globals, /\.main-content:has\(\.project-layout-root\)/);
});

test("dirty borders compare draft values against submitted current lot", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /normalizeComparableText/);
  assert.match(controller, /normalizeComparableText\(draftValues\.lotNumber\)/);
  assert.match(controller, /normalizeComparableText\(submittedValues\.lotNumber\)/);
  assert.match(controller, /normalizeComparableText\(draftValues\.title\)/);
  assert.match(controller, /normalizeComparableText\(submittedValues\.title\)/);
  assert.match(controller, /normalizeBidForComparison/);
  assert.doesNotMatch(controller, /selectedLotBaseline/);
});

test("lot submit uses dedicated pending state without disabling package controls", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /isSubmittingLot/);
  assert.match(controller, /isLoadingPackage/);
  assert.match(controller, /disabled=\{isLoadingPackage\}/);
  assert.match(controller, /disabled=\{!hasSavedDownloads \|\| clearingDownloads\}/);
  assert.doesNotMatch(controller, /disabled=\{Boolean\(pendingAction\)\}/);
  assert.doesNotMatch(controller, /pendingAction/);
});

test("navigation updates draft atomically without backend lot load", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /selectDownloadedLotByIndex/);
  assert.match(controller, /populateEditingDraftFromDownloadedLot/);
  assert.doesNotMatch(controller, /localLoadLotForEditing/);
  assert.match(controller, /key=\{`lot-photos-\$\{projectId\}`\}/);
});

test("active dataset is not refetched on envelope changes from lot submit", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /getActiveAuctionDataset\(projectId\)/);
  assert.doesNotMatch(controller, /\[projectId, envelope\]/);
});

test("dirty field borders keep constant border width", () => {
  const controller = readSrc("src/components/bag-graphics/BagControllerClient.tsx");
  assert.match(controller, /border border-warning/);
  assert.match(controller, /border border-border/);
  assert.doesNotMatch(controller, /border-2 border-warning/);
});
