import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const detailPage = readSrc("workers/data-engine/src/adapters/bag-lot-detail-page.js");
const photoDownload = readSrc("desktop/src/services/broad-arrow-export-photo-download.ts");
const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");
const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
const fixtureTest = readSrc("desktop/scripts/test-bag-edit-page-extraction.mjs");

test("fixture extracts five URLs from #photos-list img", () => {
  assert.match(fixtureTest, /expectedPhotoUrls/);
  assert.match(fixtureTest, /#photos-list img/);
  assert.match(fixtureTest, /photoSelectorMatches, 5/);
  assert.match(fixtureTest, /photoUrlsExtracted, 5/);
});

test("lot detail parser keeps verified #photos-list img selector", () => {
  assert.match(detailPage, /#photos-list img/);
  assert.doesNotMatch(detailPage, /#images img/);
});

test("dedicated export runner processes lot details and photo URLs", () => {
  assert.match(runner, /fetchLotDetailData\(detailPage, editUrl/);
  assert.match(runner, /detail\.photoUrls/);
  assert.match(runner, /await downloadExportPhotoBytes/);
});

test("desktop export maps downloaded photos into auction JSON", () => {
  assert.match(runner, /localPath: relativePath/);
  assert.match(runner, /remoteUrl: photoUrl/);
  assert.match(exportService, /buildAssetUrl\(packageId, relativePath\)/);
});

test("dedicated photo downloader uses fetch first and puppeteer fallback", () => {
  assert.match(photoDownload, /await fetch\(input\.photoUrl/);
  assert.match(photoDownload, /input\.page\.goto\(input\.photoUrl/);
  assert.match(photoDownload, /response\.buffer\(\)/);
  assert.match(photoDownload, /CONTENT_TYPE_EXTENSION/);
});

test("export writes photos into photos/lot-* folders", () => {
  assert.match(photoDownload, /sanitizeLotPhotoFolder/);
  assert.match(runner, /path\.posix\.join\("photos", lotFolder/);
  assert.match(runner, /sanitizeLotPhotoFolder\(lotNumber\)/);
});

test("export awaits photo work before writing JSON", () => {
  assert.match(runner, /for \(let photoIndex = 0; photoIndex < photoUrls\.length; photoIndex \+= 1\)/);
  assert.match(runner, /fs\.writeFileSync\(input\.packagePaths\.jsonPath/);
  assert.doesNotMatch(runner, /forEach\(async/);
});

test("photo export uses raw bytes without sharp normalization", () => {
  assert.doesNotMatch(photoDownload, /sharp/);
  assert.doesNotMatch(runner, /sharp/);
  assert.doesNotMatch(exportService, /convertImageBufferToJpeg/);
});

test("failed individual photos are recorded without aborting package", () => {
  assert.match(runner, /photosFailed \+= 1/);
  assert.match(runner, /downloaded: false/);
  assert.match(runner, /diagnostics\.lotFailures\.push/);
});

test("JSON export completes with photo discovery metadata", () => {
  assert.match(runner, /photoDiscovery:/);
  assert.match(exportService, /resolveUniqueBroadArrowExportPackage/);
  assert.match(runner, /auction-data\.json/);
});

test("local controller can load downloaded photo display URLs", () => {
  const localApi = readSrc("desktop/src/services/local-api-server.ts");
  const thumbnails = readSrc("src/components/bag-graphics/LotPhotoThumbnails.tsx");
  assert.match(localApi, /offline-assets/);
  assert.match(exportService, /displayUrl/);
  assert.match(thumbnails, /displayUrl|photoUrls|photos/);
});

test("worker export discovery module was removed from desktop export path", () => {
  assert.equal(
    fs.existsSync(path.join(repoRoot, "desktop/src/services/bag-export-photo-discovery.ts")),
    false,
  );
  assert.doesNotMatch(exportService, /discoverLotPhotoUrls/);
});
