import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("shared runtime posts canonical NEUD_DATA_UPDATE messages", () => {
  const templates = read("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /source: "neud-runtime"/);
  assert.match(templates, /type: "NEUD_DATA_UPDATE"/);
  assert.match(templates, /payload: snapshot/);
  assert.match(templates, /NEUD_DISPLAY_READY/);
});

test("v2 bridge maps canonical current fields to auctionDisplay view", () => {
  const bridge = read("desktop/src/displays/legacy-pylon-v2-bridge.js");
  assert.match(bridge, /buildAuctionDisplayView/);
  assert.match(bridge, /current\.price/);
  assert.match(bridge, /current\.lot/);
  assert.match(bridge, /NEUD_DISPLAY_READY/);
  assert.match(bridge, /NEUD_DATA_UPDATE/);
  assert.match(bridge, /window\.NEUDDisplay\.subscribe/);
});

test("legacy v1 pylon html transforms into v2 without self polling", async () => {
  const { transformLegacyPylonHtmlV1ToV2, isLegacyPylonV2Html } = await import(
    "../dist/displays/legacy-display-v2-transform.js"
  );
  const v1 = read("public/displays/pylon/index.html");
  const v2 = transformLegacyPylonHtmlV1ToV2(v1);
  assert.doesNotMatch(v2, /display-connection\.js/);
  assert.doesNotMatch(v2, /NEUDDisplayConnection/);
  assert.match(v2, /buildAuctionDisplayView/);
  assert.equal(isLegacyPylonV2Html(v2), true);
  assert.match(v1, /NEUDDisplayConnection/);
});

test("representative canonical json populates auction display view fields", () => {
  const bridgeSource = read("desktop/src/displays/legacy-pylon-v2-bridge.js");
  const renderCalls = [];
  const sandbox = {
    renderCalls,
    render(feed) {
      renderCalls.push(feed);
    },
    statusEl: { textContent: "pending" },
    console,
    postMessageCalls: [],
    messageHandler: null,
    window: {},
  };

  sandbox.window = {
    addEventListener(type, handler) {
      if (type === "message") {
        sandbox.messageHandler = handler;
      }
    },
    postMessage(payload) {
      sandbox.postMessageCalls.push(payload);
    },
    location: { origin: "http://127.0.0.1:3000" },
    NEUDDisplay: {
      getSnapshot: () => null,
      subscribe() {},
      signalReady() {},
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(bridgeSource, sandbox);

  assert.equal(sandbox.postMessageCalls.length, 1);
  assert.equal(sandbox.postMessageCalls[0].type, "NEUD_DISPLAY_READY");

  sandbox.messageHandler({
    origin: "http://127.0.0.1:3000",
    data: {
      source: "neud-runtime",
      type: "NEUD_DATA_UPDATE",
      version: 1,
      payload: {
        current: {
          lot: "101",
          title: "2020 Example Lot",
          price: "$ 20,000",
          status: "No Reserve",
        },
        auctionDisplay: {
          photos: ["https://example.test/photo.jpg"],
          currencies: ["USD $ 20,000"],
        },
        dataSource: "webpage-scraper",
      },
    },
  });

  assert.equal(renderCalls.length, 1);
  assert.equal(renderCalls[0].auctionDisplay.lot, "Lot 101");
  assert.equal(renderCalls[0].auctionDisplay.title, "2020 Example Lot");
  assert.equal(renderCalls[0].auctionDisplay.biddingPrice, "$ 20,000");
  assert.equal(renderCalls[0].auctionDisplay.reserveStatus, "No Reserve");
  assert.deepEqual(renderCalls[0].auctionDisplay.photos, ["https://example.test/photo.jpg"]);
});

test("publish service preserves v1 and creates named v2 revision", () => {
  const service = read("desktop/src/services/legacy-display-v2-publish-service.ts");
  const transform = read("desktop/src/displays/legacy-display-v2-transform.ts");
  assert.match(service, /publishLegacyTickerV2/);
  assert.match(service, /revisionName = "v2"/);
  assert.match(service, /writeDisplayRevision/);
  assert.match(service, /derivedFromRevisionId/);
  assert.match(transform, /transformLegacyPylonHtmlV1ToV2/);
});
