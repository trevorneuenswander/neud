import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  getVehicleIdFromEditUrl,
  resolveLotEditUrlForExport,
  resolveAuctionOriginFromUrl,
  buildEditUrlDiagnostics,
  formatComprehensiveExportFailureMessage,
} from "../dist/services/bag-edit-url-resolution.js";
import {
  createLotDetailError,
  parseLotDetailPageDocument,
} from "../../workers/data-engine/src/adapters/bag-lot-detail-page.js";
import {
  resolveExportEditUrl,
} from "../../workers/data-engine/src/adapters/bag-edit-url-resolution.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const distRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/services");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const BAG_ORIGIN = "https://bagauction-jumbotron.auctionaccelerate.com";

test("vehicles list parser preserves /vehicles/{id}/edit anchor href", () => {
  const runtime = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  assert.match(runtime, /a\.btn\[href\^="\/vehicles\/"\]\[href\$="\/edit"\]/);
  assert.match(runtime, /editHref = editA\?\.getAttribute\("href"\)/);
});

test("relative edit URL resolves against Broad Arrow origin", () => {
  const resolved = resolveLotEditUrlForExport("/vehicles/6041/edit", BAG_ORIGIN);
  assert.equal(resolved, `${BAG_ORIGIN}/vehicles/6041/edit`);
});

test("edit URL does not resolve against localhost", () => {
  assert.equal(resolveLotEditUrlForExport("/vehicles/6041/edit", "http://127.0.0.1:3000"), null);
  assert.equal(resolveLotEditUrlForExport("/vehicles/6041/edit", "http://localhost:3000"), null);
  assert.equal(
    resolveExportEditUrl("/vehicles/6041/edit", "http://localhost:3000/vehicles"),
    null,
  );
});

test("/vehicles/6041/edit is not converted to /vehicles/6041", () => {
  const resolved = resolveLotEditUrlForExport("/vehicles/6041/edit", BAG_ORIGIN);
  assert.match(resolved, /\/vehicles\/6041\/edit$/);
  assert.doesNotMatch(resolved, /\/vehicles\/6041$/);
});

test("/vehicles/6041 without edit suffix is normalized to /edit", () => {
  const resolved = resolveLotEditUrlForExport("/vehicles/6041", BAG_ORIGIN);
  assert.equal(resolved, `${BAG_ORIGIN}/vehicles/6041/edit`);
});

test("detail navigation captures HTTP status, final URL, and page title metadata", () => {
  const detailPage = readSrc("workers/data-engine/src/adapters/bag-lot-detail-page.js");
  assert.match(detailPage, /response\?\.status\?\.\(\)/);
  assert.match(detailPage, /finalUrl = page\.url\(\)/);
  assert.match(detailPage, /pageTitle = await page\.title\(\)/);
  assert.match(detailPage, /navigationCompleted: true/);
});

test("login redirects are detected from path and sign-in form", () => {
  const detailPage = readSrc("workers/data-engine/src/adapters/bag-lot-detail-page.js");
  assert.match(detailPage, /path\.includes\("sign_in"\)/);
  assert.match(detailPage, /form\[action\*="sign_in"\]/);
  assert.match(detailPage, /Lot Details page redirected to sign-in\./);
});

test("form.edit_vehicle is required before parsing lot details", () => {
  const detailPage = readSrc("workers/data-engine/src/adapters/bag-lot-detail-page.js");
  assert.match(detailPage, /form\.edit_vehicle/);
  assert.match(detailPage, /editFormFound/);
  assert.match(detailPage, /expected edit form/);
});

test("vehicle ID is extracted from edit URL", () => {
  assert.equal(getVehicleIdFromEditUrl("/vehicles/6041/edit"), "6041");
  assert.equal(getVehicleIdFromEditUrl(`${BAG_ORIGIN}/vehicles/6041/edit`), "6041");
  assert.equal(getVehicleIdFromEditUrl("/vehicles/6041"), null);
});

test("merge succeeds by vehicle ID when lot numbers differ", async () => {
  const { resolveLotEditUrlFromLot } = await import(
    pathToFileURL(path.join(distRoot, "bag-edit-url-resolution.js")).href
  );

  const lot = {
    lotNumber: "101",
    editHref: "/vehicles/6041/edit",
    editUrl: `${BAG_ORIGIN}/vehicles/6041/edit`,
    vehicleId: "6041",
  };

  const resolved = resolveLotEditUrlFromLot(lot, BAG_ORIGIN);
  assert.equal(resolved.vehicleId, "6041");
  assert.match(resolved.editUrl, /\/vehicles\/6041\/edit$/);
});

test("buildEditUrlDiagnostics records source and resolved edit URL samples", () => {
  const lots = [
    { lotNumber: "101", editHref: "/vehicles/6041/edit" },
    { lotNumber: "102", editHref: "/vehicles/6042/edit" },
  ];
  const diagnostics = buildEditUrlDiagnostics(lots, BAG_ORIGIN);
  assert.equal(diagnostics.lotsTotal, 2);
  assert.equal(diagnostics.lotsWithSourceEditHref, 2);
  assert.equal(diagnostics.lotsWithResolvedEditUrl, 2);
  assert.deepEqual(diagnostics.sampleSourceEditUrls, ["/vehicles/6041/edit", "/vehicles/6042/edit"]);
  assert.match(diagnostics.sampleResolvedEditUrls[0], /\/vehicles\/6041\/edit$/);
});

test("parser exceptions are recorded with parse stage metadata", () => {
  const error = createLotDetailError("parse", "Lot detail parser failed.", {
    sourceEditUrl: "/vehicles/6041/edit",
    resolvedEditUrl: `${BAG_ORIGIN}/vehicles/6041/edit`,
    editFormFound: true,
    navigationCompleted: true,
  });
  assert.equal(error.stage, "parse");
  assert.equal(error.meta.editFormFound, true);
});

test("export abort flag resets at the start of each export command", () => {
  const runtime = readSrc("workers/data-engine/src/engine-runtime.js");
  assert.match(runtime, /exportAbortRequested = false/);
});

test("comprehensive export processes lot details sequentially on one dedicated page", () => {
  const runtime = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  assert.match(runtime, /for \(let taskIndex = 0; taskIndex < tasks\.length; taskIndex \+= 1\)/);
  assert.match(runtime, /const tempPage = await browser\.newPage\(\)/);
  assert.doesNotMatch(runtime, /Promise\.all\(\s*tasks\.map\(\(task\) => processLot\(tempPage/);
});

test("parsed and merged counters are tracked separately in worker export", () => {
  const runtime = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  assert.match(runtime, /detailPagesParsed/);
  assert.match(runtime, /detailResultsMerged/);
  assert.match(runtime, /detailNavigationsSucceeded/);
});

test("failure output includes the first sanitized lot failure", () => {
  const message = formatComprehensiveExportFailureMessage({
    diagnostics: {
      detailNavigationsSucceeded: 0,
      detailPagesParsed: 0,
      detailResultsMerged: 0,
      lotFailures: [
        {
          lotId: "101",
          lotNumber: "101",
          sourceEditUrl: "/vehicles/6041/edit",
          resolvedEditUrl: `${BAG_ORIGIN}/vehicles/6041/edit`,
          stage: "navigation",
          navigationStatus: null,
          finalUrl: `${BAG_ORIGIN}/users/sign_in`,
          pageTitle: "Sign in",
          loginPageDetected: true,
          message: "redirected to sign-in",
        },
      ],
    },
  });

  assert.match(message, /First failure:/);
  assert.match(message, /Lot 101/);
  assert.match(message, /\/vehicles\/6041\/edit/);
  assert.match(message, /Stage: navigation/);
  assert.match(message, /redirected to sign-in/);
});

test("diagnostics do not expose credentials, cookies, or tokens", () => {
  const resolution = readSrc("desktop/src/services/bag-edit-url-resolution.ts");
  const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");
  const auth = readSrc("desktop/src/services/broad-arrow-export-auth.ts");
  const diagnostics = readSrc("desktop/src/services/comprehensive-export-diagnostics.ts");

  for (const source of [resolution, runner, auth, diagnostics]) {
    assert.doesNotMatch(source, /authorization header/i);
    assert.doesNotMatch(source, /csrf/i);
    assert.doesNotMatch(source, /cookie value/i);
    assert.doesNotMatch(source, /console\.log\(.*password/i);
  }

  const runtime = readSrc("workers/data-engine/src/adapters/bag-auction-legacy-runtime.js");
  assert.match(runtime, /sessionCookieNames/);
  assert.match(runtime, /cookie\.name/);
  assert.doesNotMatch(runtime, /sessionCookieNames[\s\S]{0,120}cookie\.value/);
});

test("invariant no longer uses generic worker did not successfully process message", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  assert.doesNotMatch(
    exportService,
    /Comprehensive export failed: the worker did not successfully process any lot detail pages\./,
  );
  assert.match(exportService, /formatComprehensiveExportFailureMessage/);
});

test("auction origin resolves from configured source URL not renderer localhost", () => {
  assert.equal(
    resolveAuctionOriginFromUrl("https://bagauction-jumbotron.auctionaccelerate.com/vehicles"),
    BAG_ORIGIN,
  );
  assert.equal(resolveAuctionOriginFromUrl("http://127.0.0.1:3000"), null);
});

test("supplied edit-page fixture maps no-reserve checkbox to no-reserve status", () => {
  const fixturePath = path.join(
    repoRoot,
    "workers/data-engine/fixtures/bag-lot-edit-page.html",
  );
  const html = fs.readFileSync(fixturePath, "utf8");
  assert.match(html, /id="vehicle_no_reserve"/);
  assert.match(html, /checked="checked"/);

  class MockInput {
    constructor({ type, value = "", checked = false } = {}) {
      this.tagName = "INPUT";
      this.type = type;
      this.value = value;
      this.checked = checked;
    }
  }

  const doc = {
    defaultView: { location: { href: `${BAG_ORIGIN}/vehicles/6041/edit` } },
    querySelector(selector) {
      if (selector === "#vehicle_sold") return new MockInput({ type: "checkbox", checked: false });
      if (selector === "#vehicle_no_reserve") return new MockInput({ type: "checkbox", checked: true });
      if (selector === "#vehicle_reserves_off") return new MockInput({ type: "checkbox", checked: false });
      if (selector === "#vehicle_reserve_price") return new MockInput({ type: "text", value: "0.0" });
      if (selector === "#photos-list") return { id: "photos-list" };
      if (selector === "#vehicle_current_price") return new MockInput({ type: "text", value: "" });
      return null;
    },
    querySelectorAll(selector) {
      if (selector !== "#photos-list img") return [];
      return html.match(/<img\b[^>]*>/gi)?.length
        ? Array.from({ length: 5 }, (_, index) => ({
            getAttribute(name) {
              return name === "src" ? `https://cdn.example.com/${index}.jpg` : null;
            },
          }))
        : [];
    },
  };

  const parsed = parseLotDetailPageDocument(doc);
  assert.equal(parsed.noReserve, true);
  assert.equal(parsed.reserveStatus, "no-reserve");
  assert.equal(parsed.photoUrls.length, 5);
});
