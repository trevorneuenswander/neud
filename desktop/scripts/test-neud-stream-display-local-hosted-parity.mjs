#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const normalizeModulePath = pathToFileURL(
  path.join(repoRoot, "shared/display-runtime/normalize-display-snapshot.ts"),
).href;
const bridgePath = pathToFileURL(
  path.join(repoRoot, "src/lib/hosted/hosted-display-runtime-bridge.ts"),
).href;
const displayDocumentPath = pathToFileURL(
  path.join(repoRoot, "src/lib/developer-tools/display-document.ts"),
).href;

const {
  resolveDisplayRuntimeSnapshot,
  describeDisplayRuntimePayloadShape,
} = await import(normalizeModulePath);
const { buildNeudDataUpdateMessage } = await import(bridgePath);
const { prepareHostedDisplayDocument, DISPLAY_BRIDGE_SCRIPT, HOSTED_BRIDGE_INBOUND_SCRIPT } =
  await import(displayDocumentPath);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function hashContent(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const REPRESENTATIVE_CANONICAL = {
  current: {
    lot: "101",
    title: "2020 Example Lot",
    price: "$ 20,000",
    status: "No Reserve",
  },
  auctionDisplay: {
    lot: "Lot 101",
    title: "2020 Example Lot",
    biddingPrice: "$ 20,000",
    reserveStatus: "No Reserve",
    photos: ["https://example.test/photo.jpg"],
    currencies: ["EUR 18.000", "GBP 16,000"],
  },
  next: [{ lot: "102", title: "Next lot" }],
  lots: [],
  prev: null,
  lastSold: null,
  dataSource: "webpage-scraper",
  updatedAt: "2026-07-21T00:00:00.000Z",
};

const LOCAL_BRIDGE_API_RESPONSE = {
  ...REPRESENTATIVE_CANONICAL,
  enabled: true,
  source: "webpage-scraper",
  revision: 7,
  snapshot: REPRESENTATIVE_CANONICAL,
  broadArrowDisplay: {
    pylon: REPRESENTATIVE_CANONICAL.auctionDisplay,
    ticker: { next: REPRESENTATIVE_CANONICAL.next },
    updatedAt: REPRESENTATIVE_CANONICAL.updatedAt,
    dataSource: REPRESENTATIVE_CANONICAL.dataSource,
  },
  currencies: ["EUR 18.000"],
  projectId: "project-1",
};

const HOSTED_RPC_CANONICAL = REPRESENTATIVE_CANONICAL;

function extractStreamBidDomState(doc) {
  const lotNumber = doc.getElementById("lotNumber");
  const vehicleTitle = doc.getElementById("vehicleTitle");
  const primaryBid = doc.getElementById("primaryBid");
  const reserveStatus = doc.getElementById("reserveStatus");
  const mainPhoto = doc.getElementById("mainPhoto");
  return {
    lotNumber:
      lotNumber?.textContent?.trim() || lotNumber?.getAttribute("data-text")?.trim() || "",
    vehicleTitle:
      vehicleTitle?.textContent?.trim() || vehicleTitle?.getAttribute("data-title")?.trim() || "",
    primaryBid:
      primaryBid?.textContent?.trim() || primaryBid?.getAttribute("data-text")?.trim() || "",
    reserveStatus:
      reserveStatus?.textContent?.trim() ||
      reserveStatus?.getAttribute("data-text")?.trim() ||
      "",
    currencyCount: doc.querySelectorAll("#currencyList .currency-row").length,
    mainPhotoList: mainPhoto?.getAttribute("data-photo-list") ?? "",
    mainPhotoSrc:
      mainPhoto?.getAttribute("data-src") || mainPhoto?.getAttribute("src") || "",
  };
}

function createLocalRuntimeSandbox(apiPayload) {
  const sandbox = {
    subscriberSnapshots: [],
    console,
    window: {},
  };

  sandbox.window = {
    NEUDDisplay: {
      _subscribers: [],
      _snapshot: null,
      _publish(snapshot) {
        this._snapshot = snapshot;
        for (const callback of this._subscribers) {
          callback(snapshot);
        }
      },
      subscribe(callback) {
        this._subscribers.push(callback);
      },
    },
    addEventListener() {},
    postMessage() {},
    location: { origin: "http://127.0.0.1:8070", search: "" },
  };

  vm.createContext(sandbox);
  vm.runInContext(read("shared/display-runtime/browser/normalize-display-snapshot.js"), sandbox);
  vm.runInContext(read("shared/display-runtime/browser/display-runtime-publisher.js"), sandbox);
  vm.runInContext(DISPLAY_BRIDGE_SCRIPT, sandbox);

  const snapshot = sandbox.resolveDisplayRuntimeSnapshot(apiPayload);
  assert.ok(snapshot, "local runtime snapshot should resolve");
  sandbox.window.NEUDDisplay._publish(snapshot);
  sandbox.subscriberSnapshots = sandbox.window.NEUDDisplay._subscribers.map((callback) => {
    const captures = [];
    const original = callback;
    captures.push = () => {};
    return snapshot;
  });

  return { sandbox, snapshot };
}

test("local and hosted normalization produce identical runtime snapshots", () => {
  const localSnapshot = resolveDisplayRuntimeSnapshot(LOCAL_BRIDGE_API_RESPONSE);
  const hostedSnapshot = resolveDisplayRuntimeSnapshot(HOSTED_RPC_CANONICAL);
  const hostedWrappedSnapshot = resolveDisplayRuntimeSnapshot({
    data: HOSTED_RPC_CANONICAL,
  });

  assert.deepEqual(Object.keys(localSnapshot ?? {}).sort(), Object.keys(hostedSnapshot ?? {}).sort());
  assert.deepEqual(localSnapshot?.current, hostedSnapshot?.current);
  assert.deepEqual(localSnapshot?.auctionDisplay, hostedSnapshot?.auctionDisplay);
  assert.deepEqual(hostedSnapshot, hostedWrappedSnapshot);
});

test("shared normalization unwraps local bridge snapshot wrapper", () => {
  const shape = describeDisplayRuntimePayloadShape({
    payload: LOCAL_BRIDGE_API_RESPONSE,
    messageType: "NEUD_DATA_UPDATE",
    revision: 7,
  });

  assert.equal(shape.presence.snapshot, true);
  assert.equal(shape.presence.current, true);
  assert.equal(shape.presence.auctionDisplay, true);
  assert.equal(shape.presence.currentLotPresent, true);
  assert.equal(shape.presence.currentBidPresent, true);
  assert.equal(shape.presence.photoCount, 1);
});

test("stream bid local and hosted paths render identical DOM fields", async () => {
  const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
  const { transformStreamBidHtmlForServing } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/displays/stream-display-v2-transform.js"),
    ).href
  );

  const rawHtml = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const servedHtml = transformStreamBidHtmlForServing(rawHtml);
  const localSnapshot = resolveDisplayRuntimeSnapshot(LOCAL_BRIDGE_API_RESPONSE);
  const hostedSnapshot = resolveDisplayRuntimeSnapshot(HOSTED_RPC_CANONICAL);
  assert.deepEqual(localSnapshot, hostedSnapshot);

  const localHtml = `<!doctype html><html><head><script>${DISPLAY_BRIDGE_SCRIPT}</script></head><body>${servedHtml}</body></html>`;
  const hostedHtml = prepareHostedDisplayDocument(servedHtml);
  const updateMessage = buildNeudDataUpdateMessage({
    payload: hostedSnapshot,
    revision: 7,
  });

  assert.match(hostedHtml, /neud-hosted-bridge:v3/);
  assert.equal(hashContent(servedHtml), hashContent(servedHtml));

  const { puppeteer, launchOptions } = await loadValidationPuppeteer();
  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 3840, height: 2160, deviceScaleFactor: 1 });

    await page.setContent(localHtml, { waitUntil: "domcontentloaded" });
    await page.evaluate((snapshot) => {
      window.NEUDDisplay._publish(snapshot);
    }, localSnapshot);
    const localFields = await page.evaluate(() => {
      const lotNumber = document.getElementById("lotNumber");
      const vehicleTitle = document.getElementById("vehicleTitle");
      const primaryBid = document.getElementById("primaryBid");
      const reserveStatus = document.getElementById("reserveStatus");
      const mainPhoto = document.getElementById("mainPhoto");
      return {
        lotNumber:
          lotNumber?.textContent?.trim() || lotNumber?.getAttribute("data-text")?.trim() || "",
        vehicleTitle:
          vehicleTitle?.textContent?.trim() ||
          vehicleTitle?.getAttribute("data-title")?.trim() ||
          "",
        primaryBid:
          primaryBid?.textContent?.trim() || primaryBid?.getAttribute("data-text")?.trim() || "",
        reserveStatus:
          reserveStatus?.textContent?.trim() ||
          reserveStatus?.getAttribute("data-text")?.trim() ||
          "",
        currencyCount: document.querySelectorAll("#currencyList .currency-row").length,
        mainPhotoList: mainPhoto?.getAttribute("data-photo-list") ?? "",
      };
    });

    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#000;"><iframe id="display" sandbox="allow-scripts allow-same-origin" style="width:3840px;height:2160px;border:0;"></iframe></body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    await page.evaluate((message) => {
      window.__neudHostedUpdateMessage = message;
      const iframe = document.getElementById("display");
      iframe?.addEventListener("load", () => {
        window.setTimeout(() => {
          iframe?.contentWindow?.postMessage(window.__neudHostedUpdateMessage, "*");
        }, 50);
      });
      window.addEventListener("message", (event) => {
        if (event.data && event.data.type === "NEUD_DISPLAY_READY") {
          iframe?.contentWindow?.postMessage(window.__neudHostedUpdateMessage, "*");
        }
      });
    }, updateMessage);

    const iframeHandle = await page.$("#display");
    const frame = await iframeHandle?.contentFrame();
    assert.ok(frame);
    await frame.setContent(hostedHtml, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      const iframe = document.getElementById("display");
      iframe?.contentWindow?.postMessage(window.__neudHostedUpdateMessage, "*");
    });

    await page.waitForFunction(() => {
      const iframe = document.getElementById("display");
      const doc = iframe?.contentDocument;
      const lot = doc?.getElementById("lotNumber");
      const lotText = lot?.textContent || lot?.getAttribute("data-text") || "";
      return lotText.includes("101");
    }, { timeout: 15000 });

    const hostedFields = await page.evaluate(() => {
      const doc = document.getElementById("display")?.contentDocument;
      return {
        lotNumber:
          doc?.getElementById("lotNumber")?.textContent?.trim() ||
          doc?.getElementById("lotNumber")?.getAttribute("data-text")?.trim() ||
          "",
        vehicleTitle:
          doc?.getElementById("vehicleTitle")?.textContent?.trim() ||
          doc?.getElementById("vehicleTitle")?.getAttribute("data-title")?.trim() ||
          "",
        primaryBid:
          doc?.getElementById("primaryBid")?.textContent?.trim() ||
          doc?.getElementById("primaryBid")?.getAttribute("data-text")?.trim() ||
          "",
        reserveStatus:
          doc?.getElementById("reserveStatus")?.textContent?.trim() ||
          doc?.getElementById("reserveStatus")?.getAttribute("data-text")?.trim() ||
          "",
        currencyCount: doc?.querySelectorAll("#currencyList .currency-row").length ?? 0,
        mainPhotoList: doc?.getElementById("mainPhoto")?.getAttribute("data-photo-list") ?? "",
      };
    });

    assert.match(localFields.lotNumber, /101/);
    assert.match(hostedFields.lotNumber, /101/);
    assert.equal(localFields.lotNumber, hostedFields.lotNumber);
    assert.equal(localFields.vehicleTitle, hostedFields.vehicleTitle);
    assert.equal(localFields.primaryBid, hostedFields.primaryBid);
    assert.equal(localFields.reserveStatus, hostedFields.reserveStatus);
    assert.equal(localFields.currencyCount, hostedFields.currencyCount);
    assert.equal(localFields.mainPhotoList, hostedFields.mainPhotoList);
  } finally {
    await browser.close();
  }
});

test("stream ticker local and hosted paths populate identical slots", async () => {
  const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
  const { transformStreamTickerHtmlForServing } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/displays/stream-display-v2-transform.js"),
    ).href
  );

  const tickerPayload = {
    next: [
      { lot: "201", title: "First Upcoming Lot" },
      { lot: "202", title: "Second Upcoming Lot" },
      { lot: "203", title: "Third Upcoming Lot" },
    ],
    dataSource: "webpage-scraper",
    updatedAt: "2026-07-21T00:00:00.000Z",
  };

  const localSnapshot = resolveDisplayRuntimeSnapshot({
    snapshot: tickerPayload,
    ...tickerPayload,
  });
  const hostedSnapshot = resolveDisplayRuntimeSnapshot(tickerPayload);
  assert.deepEqual(localSnapshot?.next, hostedSnapshot?.next);

  const rawHtml = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  const servedHtml = transformStreamTickerHtmlForServing(rawHtml);
  const localHtml = `<!doctype html><html><head><script>${DISPLAY_BRIDGE_SCRIPT}</script></head><body>${servedHtml}</body></html>`;
  const hostedHtml = prepareHostedDisplayDocument(servedHtml);
  const updateMessage = buildNeudDataUpdateMessage({ payload: hostedSnapshot, revision: 2 });

  const { puppeteer, launchOptions } = await loadValidationPuppeteer();
  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 3840, height: 240, deviceScaleFactor: 1 });

    await page.setContent(localHtml, { waitUntil: "domcontentloaded" });
    await page.evaluate((snapshot) => {
      window.NEUDDisplay._publish(snapshot);
    }, localSnapshot);
    const localSlots = await page.evaluate(() => ({
      slot1: document.getElementById("slot1")?.textContent?.trim() ?? "",
      slot2: document.getElementById("slot2")?.textContent?.trim() ?? "",
    }));

    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#000;"><iframe id="display" sandbox="allow-scripts allow-same-origin" style="width:3840px;height:240px;border:0;"></iframe></body></html>`,
    );
    const frame = await (await page.$("#display"))?.contentFrame();
    assert.ok(frame);
    await frame.setContent(hostedHtml, { waitUntil: "domcontentloaded" });
    await frame.evaluate((message) => {
      window.postMessage(message, "*");
    }, updateMessage);

    await frame.waitForFunction(() => {
      const slot1 = document.getElementById("slot1");
      const slotText = slot1?.textContent || slot1?.getAttribute("data-text") || "";
      return slotText.includes("201");
    }, { timeout: 15000 });

    const hostedSlots = await frame.evaluate(() => ({
      slot1: document.getElementById("slot1")?.textContent?.trim() ?? "",
      slot2: document.getElementById("slot2")?.textContent?.trim() ?? "",
    }));

    assert.match(localSlots.slot1, /201/);
    assert.match(hostedSlots.slot1, /201/);
    assert.equal(localSlots.slot1, hostedSlots.slot1);
    assert.equal(localSlots.slot2, hostedSlots.slot2);
  } finally {
    await browser.close();
  }
});

test("embedded hosted bridge uses shared resolveDisplayRuntimeSnapshot", () => {
  assert.match(HOSTED_BRIDGE_INBOUND_SCRIPT, /NEUD_HOSTED_BRIDGE_BOOTED/);
  assert.match(HOSTED_BRIDGE_INBOUND_SCRIPT, /resolveDisplayRuntimeSnapshot/);
  assert.match(DISPLAY_BRIDGE_SCRIPT, /resolveDisplayRuntimeSnapshot/);
  assert.match(DISPLAY_BRIDGE_SCRIPT, /publishRuntimeSnapshot/);
});
