import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  parseLotDetailPageDocument,
  parseLotDetailPageFromDocument,
} from "../../workers/data-engine/src/adapters/bag-lot-detail-page.js";
import { serializeEditPageReserveForStorage } from "../../workers/data-engine/src/adapters/bag-reserve-status.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = path.join(
  repoRoot,
  "workers/data-engine/fixtures/bag-lot-edit-page.html",
);

const expectedPhotoUrls = [
  "https://cdn.dealeraccelerate.com/bagauction/31/5296/254385/790x1024/original-michael-schumacher-oil-paintings",
  "https://cdn.dealeraccelerate.com/bagauction/31/5296/254387/790x1024/original-michael-schumacher-oil-paintings",
  "https://cdn.dealeraccelerate.com/bagauction/31/5296/254388/790x1024/original-michael-schumacher-oil-paintings",
  "https://cdn.dealeraccelerate.com/bagauction/31/5296/254389/790x1024/original-michael-schumacher-oil-paintings",
  "https://cdn.dealeraccelerate.com/bagauction/31/5296/254386/790x1024/original-michael-schumacher-oil-paintings",
];

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

class MockInputElement {
  constructor({ id, type = "text", value = "", checked = false } = {}) {
    this.tagName = "INPUT";
    this.id = id;
    this.type = type;
    this.value = value;
    this.checked = checked;
  }

  getAttribute(name) {
    if (name === "src") return null;
    if (name === "value") return this.value;
    return null;
  }
}

class MockImageElement {
  constructor(src) {
    this.src = src;
  }

  getAttribute(name) {
    if (name === "src") return this.src;
    return null;
  }
}

function createFixtureDocument(html) {
  const inputs = new Map();
  const photos = [];

  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    const idMatch = tag.match(/\bid="([^"]+)"/i);
    if (!idMatch) continue;
    const id = idMatch[1];
    const typeMatch = tag.match(/\btype="([^"]+)"/i);
    const type = typeMatch?.[1] ?? "text";
    const valueMatch = tag.match(/\bvalue="([^"]*)"/i);
    const value = valueMatch?.[1] ?? "";
    const checked = /checked(?:="checked")?/i.test(tag);
    inputs.set(`#${id}`, new MockInputElement({ id, type, value, checked }));
  }

  const photosListMatch = html.match(/<ul[^>]*id="photos-list"[^>]*>([\s\S]*?)<\/ul>/i);
  if (photosListMatch) {
    for (const imgMatch of photosListMatch[1].matchAll(/<img\b[^>]*>/gi)) {
      const srcMatch = imgMatch[0].match(/\bsrc="([^"]+)"/i);
      if (srcMatch?.[1]) {
        photos.push(new MockImageElement(srcMatch[1]));
      }
    }
  }

  return {
    defaultView: { location: { href: "https://example.com/vehicles/6041/edit" } },
    querySelector(selector) {
      if (selector === "#photos-list") {
        return photos.length > 0 ? { id: "photos-list" } : null;
      }
      return inputs.get(selector) ?? null;
    },
    querySelectorAll(selector) {
      if (selector === "#photos-list img") {
        return photos;
      }
      return [];
    },
  };
}

test("lot detail parser uses verified edit-page selectors only", () => {
  const detailPage = readSrc("workers/data-engine/src/adapters/bag-lot-detail-page.js");
  const reserveStatus = readSrc("workers/data-engine/src/adapters/bag-reserve-status.js");

  assert.match(detailPage, /parseLotDetailPageFromDocument/);
  assert.match(detailPage, /parseLotDetailPageDocument/);
  assert.match(detailPage, /#photos-list img/);
  assert.match(detailPage, /#vehicle_sold/);
  assert.match(detailPage, /#vehicle_no_reserve/);
  assert.match(detailPage, /#vehicle_reserves_off/);
  assert.match(detailPage, /#vehicle_reserve_price/);
  assert.doesNotMatch(detailPage, /#js-no-reserve/);
  assert.doesNotMatch(detailPage, /#js-reserved-sm/);
  assert.doesNotMatch(detailPage, /#images img/);
  assert.doesNotMatch(detailPage, /scrollBy/);
  assert.match(reserveStatus, /normalizeEditPageReserveStatus/);
  assert.match(reserveStatus, /serializeEditPageReserveForStorage/);
  assert.doesNotMatch(reserveStatus, /#js-no-reserve/);
});

test("fixture edit page returns five verified CDN photo URLs", () => {
  const html = fs.readFileSync(fixturePath, "utf8");
  const parsed = parseLotDetailPageDocument(createFixtureDocument(html));

  assert.equal(parsed.sold, false);
  assert.equal(parsed.noReserve, true);
  assert.equal(parsed.reservesOff, false);
  assert.equal(parsed.reservePrice, 0);
  assert.equal(parsed.reservePriceRaw, "0.0");
  assert.equal(parsed.reserveStatus, "no-reserve");
  assert.equal(serializeEditPageReserveForStorage(parsed.reserveStatus), "offered_without_reserve");
  assert.deepEqual(parsed.photoUrls, expectedPhotoUrls);
  assert.equal(parsed.diagnostics.photoContainerFound, true);
  assert.equal(parsed.diagnostics.photoSelectorMatches, 5);
  assert.equal(parsed.diagnostics.photoUrlsExtracted, 5);
  assert.equal(parsed.diagnostics.soldSelectorFound, true);
  assert.equal(parsed.diagnostics.noReserveSelectorFound, true);
  assert.equal(parsed.diagnostics.reservesOffSelectorFound, true);
  assert.equal(parsed.diagnostics.reservePriceSelectorFound, true);
});

test("hidden Rails sold input does not override checkbox state", () => {
  const html = `
    <form class="edit_vehicle">
      <input value="0" type="hidden" name="vehicle[sold]" />
      <input type="checkbox" id="vehicle_sold" />
      <input type="checkbox" checked="checked" id="vehicle_no_reserve" />
      <ul id="photos-list"><li><img src="https://cdn.example.com/photo.jpg"></li></ul>
    </form>
  `;
  const parsed = parseLotDetailPageDocument(createFixtureDocument(html));
  assert.equal(parsed.sold, false);
});

test("browser evaluate parser is self-contained for Puppeteer serialization", () => {
  const source = parseLotDetailPageFromDocument.toString();
  assert.doesNotMatch(source, /parseLotDetailPageDocument\s*\(/);
  assert.match(source, /#photos-list img/);
  assert.match(source, /#vehicle_no_reserve/);
  assert.match(source, /normalizeEditPageReserveStatus/);
});

test("export reserve and sold fields are merged in dedicated runner", () => {
  const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");
  const reserve = readSrc("desktop/src/services/broad-arrow-export-reserve.ts");
  const detailPage = readSrc("workers/data-engine/src/adapters/bag-lot-detail-page.js");

  assert.match(runner, /deriveBroadArrowReserveStatusLabel/);
  assert.match(runner, /readReserveDetailsFromDetail/);
  assert.match(runner, /lot\.editPage/);
  assert.match(reserve, /deriveBroadArrowReserveStatusLabel/);
  assert.match(detailPage, /noReserve/);
  assert.match(detailPage, /reservePriceRaw/);
});

test("live scraper auction display parsing remains separate from edit-page parser", () => {
  const runtime = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  const detailPage = readSrc("workers/data-engine/src/adapters/bag-lot-detail-page.js");

  assert.match(runtime, /#js-no-reserve\.visible/);
  assert.match(runtime, /fetchVehicleDetails/);
  assert.doesNotMatch(detailPage, /#js-no-reserve/);
});

test("photo downloader for offline export uses fetch and puppeteer fallback", () => {
  const photoDownload = readSrc("desktop/src/services/broad-arrow-export-photo-download.ts");
  const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");

  assert.match(photoDownload, /await fetch\(input\.photoUrl/);
  assert.match(photoDownload, /input\.page\.goto\(input\.photoUrl/);
  assert.match(photoDownload, /response\.buffer\(\)/);
  assert.doesNotMatch(photoDownload, /sharp/);
  assert.match(runner, /downloadExportPhotoBytes/);
});
