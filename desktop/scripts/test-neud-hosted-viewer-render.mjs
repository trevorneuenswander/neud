#!/usr/bin/env node
import assert from "node:assert/strict";
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
  buildNeudDataUpdateMessage,
  isAllowedHostedViewerMessageOrigin,
  isHostedViewerMessageFromIframe,
  isNeudDataUpdateMessage,
  isNeudDataUpdateReceivedMessage,
  isNeudDisplayReadyMessage,
  isNeudHostedBridgeBootedMessage,
  isNeudHostedBridgeStatusMessage,
  isNeudRenderStatusMessage,
  resolveHostedPostMessageTargetOrigin,
} = await import(bridgePath);

const { resolveDisplayRuntimeSnapshot, resolveHostedCanonicalSnapshot } =
  await import(normalizeModulePath);

const { prepareHostedDisplayDocument, DISPLAY_BRIDGE_SCRIPT, HOSTED_BRIDGE_INBOUND_SCRIPT } =
  await import(displayDocumentPath);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const REPRESENTATIVE_CANONICAL = {
  current: {
    lot: "101",
    title: "2020 Example Lot",
    price: "$ 20,000",
    status: "No Reserve",
  },
  auctionDisplay: {
    photos: ["https://example.test/photo.jpg"],
    currencies: ["EUR 18.000", "GBP 16,000"],
  },
  next: [{ lot: "102", title: "Next lot" }],
  lots: [],
  prev: null,
  lastSold: null,
  dataSource: "webpage-scraper",
  updatedAt: "2026-07-21T00:00:00.000Z",
  auctionDisplayMeta: {},
};

function createStreamBidBridgeSandbox() {
  const renderCalls = [];
  const parentWindow = { kind: "parent" };
  const sandbox = {
    renderCalls,
    render(feed) {
      renderCalls.push(feed);
    },
    messageHandler: null,
    neudDataHandler: null,
    parentMessages: [],
    subscriberCallbacks: [],
    window: {},
  };

  sandbox.window = {
    __NEUD_DISPLAY_DATA_DISCONNECTED__: true,
    parent: parentWindow,
    addEventListener(type, handler) {
      if (type === "message") {
        sandbox.messageHandler = handler;
      }
      if (type === "neud:data") {
        sandbox.neudDataHandler = handler;
      }
    },
    postMessage(payload, targetOrigin) {
      sandbox.parentMessages.push({ payload, targetOrigin });
    },
    location: { origin: "null", search: "?neudDebug=1" },
    NEUDDisplay: {
      _subscribers: sandbox.subscriberCallbacks,
      _snapshot: null,
      getSnapshot() {
        return this._snapshot;
      },
      subscribe(callback) {
        this._subscribers.push(callback);
        if (this._snapshot) {
          callback(this._snapshot);
        }
      },
      signalReady() {},
      _publish(snapshot) {
        this._snapshot = snapshot;
        for (const callback of this._subscribers) {
          callback(snapshot);
        }
        if (sandbox.neudDataHandler) {
          sandbox.neudDataHandler({ detail: snapshot });
        }
      },
    },
  };

  vm.createContext(sandbox);
  return sandbox;
}

test("hosted viewer client uses srcDoc, layout listener, and build label", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.match(client, /srcDoc=\{preparedHtml\}/);
  assert.match(client, /useLayoutEffect/);
  assert.match(client, /HOSTED_VIEWER_PARSER_VERSION/);
  assert.match(client, /HostedViewerDiagnosticsPanel/);
  assert.match(client, /resolveHostedPostMessageTargetOrigin/);
  assert.match(client, /isHostedViewerMessageFromIframe/);
  assert.match(client, /isNeudHostedBridgeBootedMessage/);
  assert.match(client, /hostedBridgeBooted/);
  assert.match(client, /iframeGenerationRef/);
  assert.doesNotMatch(client, /retryDelaysMs = \[0, 100, 300, 750, 1500, 3000\]/);
});

test("prepareHostedDisplayDocument includes hosted bridge marker and boot handshake", () => {
  const documentModule = read("src/lib/developer-tools/display-document.ts");
  const inbound = read("shared/display-runtime/browser/hosted-bridge-inbound.js");
  assert.match(documentModule, /HOSTED_DISPLAY_BRIDGE_MARKER/);
  assert.match(documentModule, /neud-hosted-bridge:v3/);
  assert.match(documentModule, /HOSTED_BRIDGE_INBOUND_SCRIPT/);
  assert.match(inbound, /NEUD_HOSTED_BRIDGE_BOOTED/);
  assert.match(inbound, /NEUD_HOSTED_BRIDGE_ERROR/);
  assert.match(inbound, /event\.source === root\.parent/);
});

test("viewer build label includes parser and bridge versions", () => {
  const runtime = read("src/lib/hosted/hosted-viewer-runtime.ts");
  assert.match(runtime, /HOSTED_VIEWER_PARSER_VERSION/);
  assert.match(runtime, /HOSTED_RUNTIME_BRIDGE_VERSION = "3"/);
  assert.match(runtime, /shouldShowHostedViewerDebugPanel/);
  assert.match(runtime, /canonicalPayloadResolved/);
  assert.match(runtime, /iframeUpdateReceived/);
});

test("resolveDisplayRuntimeSnapshot accepts local bridge and hosted RPC payload shapes", () => {
  const localBridge = resolveDisplayRuntimeSnapshot({
    snapshot: {
      current: { lot: "101" },
      auctionDisplay: { lot: "Lot 101" },
    },
    broadArrowDisplay: {
      pylon: { lot: "Lot 101" },
      ticker: { next: [] },
    },
  });
  assert.deepEqual(localBridge?.current, { lot: "101" });

  const direct = resolveDisplayRuntimeSnapshot({
    current: { lot: "101" },
    auctionDisplay: { lot: "Lot 101" },
  });
  assert.deepEqual(direct?.current, { lot: "101" });

  const wrapped = resolveDisplayRuntimeSnapshot({
    data: {
      current: { lot: "102" },
      next: [],
    },
  });
  assert.deepEqual(wrapped?.current, { lot: "102" });

  const broadArrow = resolveDisplayRuntimeSnapshot({
    broadArrowDisplay: { pylon: { lot: "103" }, ticker: { next: [] } },
  });
  assert.ok(broadArrow?.auctionDisplay);
});

test("resolveHostedCanonicalSnapshot remains compatible alias", () => {
  const snapshot = resolveHostedCanonicalSnapshot({
    current: { lot: "101", title: "Example" },
    dataSource: "webpage-scraper",
  });
  assert.ok(snapshot);
});

test("publisher online with disconnected source still resolves canonical payload", () => {
  const snapshot = resolveHostedCanonicalSnapshot({
    current: { lot: "101", title: "Example" },
    dataSource: "webpage-scraper",
  });
  assert.ok(snapshot);
  const message = buildNeudDataUpdateMessage({
    payload: snapshot,
    revision: 3,
  });
  assert.equal(isNeudDataUpdateMessage(message), true);
  assert.equal(message.payload.current.lot, "101");
});

test("null-origin READY is accepted only from the iframe window", () => {
  const iframeWindow = {};
  const parentWindow = {};

  const ready = { source: "neud-display", type: "NEUD_DISPLAY_READY" };

  assert.equal(
    isHostedViewerMessageFromIframe(
      { source: iframeWindow, origin: "null", data: ready },
      iframeWindow,
    ),
    true,
  );
  assert.equal(isAllowedHostedViewerMessageOrigin("null", "https://preview.example"), true);
  assert.equal(isNeudDisplayReadyMessage(ready), true);

  assert.equal(
    isHostedViewerMessageFromIframe(
      { source: parentWindow, origin: "null", data: ready },
      iframeWindow,
    ),
    false,
  );
});

test("hosted bridge status messages are recognized", () => {
  const status = {
    source: "neud-display",
    type: "NEUD_HOSTED_BRIDGE_STATUS",
    iframeUpdateReceived: true,
    adapterSelected: "stream-bid-v2-bridge",
  };
  assert.equal(isNeudHostedBridgeStatusMessage(status), true);
});

test("wrong bridge source and version are rejected", () => {
  assert.equal(
    isNeudDataUpdateMessage({
      source: "other-runtime",
      type: "NEUD_DATA_UPDATE",
      version: 1,
      payload: { current: { lot: "1" } },
    }),
    false,
  );
  assert.equal(
    isNeudDataUpdateMessage({
      source: "neud-runtime",
      type: "NEUD_DATA_UPDATE",
      version: 2,
      payload: { current: { lot: "1" } },
    }),
    false,
  );
});

test("postMessage target origin uses wildcard for sandboxed null-origin iframe", () => {
  const sandbox = {
    location: { origin: "null" },
  };
  assert.equal(resolveHostedPostMessageTargetOrigin(sandbox, "https://preview.example"), "*");
});

test("postMessage target origin uses wildcard when sandboxed location is unreadable", () => {
  const sandbox = {
    get location() {
      throw new Error("SecurityError");
    },
  };
  assert.equal(resolveHostedPostMessageTargetOrigin(sandbox, "https://preview.example"), "*");
});

test("stream bid bridge accepts parent NEUD_DATA_UPDATE from hosted parent origin", async () => {
  const bridgeSource = read("desktop/src/displays/stream-bid-v2-bridge.js");
  const sandbox = createStreamBidBridgeSandbox();
  vm.runInContext(bridgeSource, sandbox);

  sandbox.messageHandler({
    origin: "https://preview.example.vercel.app",
    source: sandbox.window.parent,
    data: buildNeudDataUpdateMessage({
      payload: REPRESENTATIVE_CANONICAL,
      revision: 4,
    }),
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(sandbox.renderCalls.length, 1);
  assert.equal(sandbox.renderCalls[0].auctionDisplay.lot, "Lot 101");
  assert.equal(sandbox.renderCalls[0].auctionDisplay.title, "2020 Example Lot");
  assert.equal(sandbox.renderCalls[0].auctionDisplay.biddingPrice, "$ 20,000");
});

test("hosted inbound bridge publishes through NEUDDisplay contract for parent messages", () => {
  const sandbox = {
    messageHandler: null,
    parentMessages: [],
    subscriberCalls: [],
    console,
    window: {},
  };

  sandbox.window = {
    __NEUD_DISPLAY_DATA_DISCONNECTED__: true,
    parent: {
      postMessage(payload, targetOrigin) {
        sandbox.parentMessages.push({ payload, targetOrigin });
      },
    },
    location: { origin: "null", search: "?neudDebug=1" },
    addEventListener(type, handler) {
      if (type === "message") {
        sandbox.messageHandler = handler;
      }
    },
    NEUDDisplay: {
      _subscribers: [],
      _snapshot: null,
      subscribe(callback) {
        this._subscribers.push(callback);
        if (this._snapshot) {
          callback(this._snapshot);
        }
        return () => {};
      },
      _publish(snapshot, displayInfo) {
        this._snapshot = snapshot;
        for (const callback of this._subscribers) {
          sandbox.subscriberCalls.push(snapshot);
          callback(snapshot);
        }
        sandbox.lastPublishRevision = displayInfo?.revision ?? null;
      },
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(DISPLAY_BRIDGE_SCRIPT, sandbox);
  vm.runInContext(HOSTED_BRIDGE_INBOUND_SCRIPT, sandbox);

  const bootMessage = sandbox.parentMessages.find(
    (entry) => entry.payload?.type === "NEUD_HOSTED_BRIDGE_BOOTED",
  );
  assert.ok(bootMessage, "expected NEUD_HOSTED_BRIDGE_BOOTED");
  assert.equal(isNeudHostedBridgeBootedMessage(bootMessage.payload), true);

  const lateSubscriberCalls = [];
  sandbox.window.NEUDDisplay.subscribe((snapshot) => {
    lateSubscriberCalls.push(snapshot);
  });

  sandbox.messageHandler({
    origin: "https://preview.example.vercel.app",
    source: sandbox.window.parent,
    data: buildNeudDataUpdateMessage({
      payload: REPRESENTATIVE_CANONICAL,
      revision: 4,
    }),
  });

  assert.equal(sandbox.subscriberCalls.length, 1);
  assert.equal(sandbox.subscriberCalls[0].current.lot, "101");
  assert.equal(sandbox.lastPublishRevision, 4);
  assert.equal(lateSubscriberCalls.length, 1);
  const bridgeStatus = sandbox.parentMessages.find(
    (entry) => entry.payload?.type === "NEUD_HOSTED_BRIDGE_STATUS",
  );
  const runtimeAck = sandbox.parentMessages.find(
    (entry) => entry.payload?.type === "NEUD_DATA_UPDATE_RECEIVED",
  );
  assert.ok(bridgeStatus, "expected NEUD_HOSTED_BRIDGE_STATUS");
  assert.equal(bridgeStatus.payload.iframeUpdateReceived, true);
  assert.ok(runtimeAck, "expected NEUD_DATA_UPDATE_RECEIVED");
  assert.equal(runtimeAck.payload.runtimeGlobalPresent, true);
});

test("hosted inbound bridge replays cached payload to late subscribers", () => {
  const sandbox = {
    messageHandler: null,
    subscriberCalls: [],
    window: {},
  };

  sandbox.window = {
    __NEUD_DISPLAY_DATA_DISCONNECTED__: true,
    parent: {
      postMessage() {},
    },
    location: { origin: "null", search: "" },
    addEventListener(type, handler) {
      if (type === "message") {
        sandbox.messageHandler = handler;
      }
    },
    postMessage() {},
    NEUDDisplay: null,
  };

  vm.createContext(sandbox);
  vm.runInContext(DISPLAY_BRIDGE_SCRIPT, sandbox);
  vm.runInContext(HOSTED_BRIDGE_INBOUND_SCRIPT, sandbox);

  sandbox.messageHandler({
    origin: "https://preview.example.vercel.app",
    source: sandbox.window.parent,
    data: buildNeudDataUpdateMessage({
      payload: REPRESENTATIVE_CANONICAL,
      revision: 4,
    }),
  });

  sandbox.window.NEUDDisplay.subscribe((snapshot) => {
    sandbox.subscriberCalls.push(snapshot);
  });

  assert.equal(sandbox.subscriberCalls.length, 1);
  assert.equal(sandbox.subscriberCalls[0].current.lot, "101");
});

test("prepared hosted stream bid document keeps runtime init and removes self polling", async () => {
  const { transformStreamBidHtmlForServing } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/displays/stream-display-v2-transform.js"),
    ).href
  );

  const rawHtml = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const servedHtml = transformStreamBidHtmlForServing(rawHtml);
  const prepared = prepareHostedDisplayDocument(servedHtml);

  assert.match(prepared, /neud-hosted-bridge:v3/);
  assert.match(prepared, /buildAuctionDisplayView/);
  assert.match(prepared, /NEUDDisplay\.subscribe/);
  assert.match(prepared, /window\.render\s*=\s*function render/);
  assert.match(prepared, /__NEUD_DISPLAY_DATA_DISCONNECTED__/);
  assert.match(prepared, /NEUD_HOSTED_BRIDGE_STATUS/);
  assert.doesNotMatch(prepared, /neud-display-runtime\.js/);
});

test("hosted stream bid path renders visible DOM fields from canonical payload", async () => {
  const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
  const { transformStreamBidHtmlForServing } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/displays/stream-display-v2-transform.js"),
    ).href
  );

  const rawHtml = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const servedHtml = transformStreamBidHtmlForServing(rawHtml);
  const preparedHtml = prepareHostedDisplayDocument(servedHtml);
  const updateMessage = buildNeudDataUpdateMessage({
    payload: REPRESENTATIVE_CANONICAL,
    revision: 4,
  });

  const { puppeteer, launchOptions } = await loadValidationPuppeteer();
  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 3840, height: 2160, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000;"></body></html>`);
    await page.evaluate((html) => {
      const iframe = document.createElement("iframe");
      iframe.id = "display";
      iframe.title = "Stream Bid Display";
      iframe.sandbox = "allow-scripts";
      iframe.srcdoc = html;
      iframe.style.width = "3840px";
      iframe.style.height = "2160px";
      iframe.style.border = "0";
      document.body.appendChild(iframe);
    }, preparedHtml);

    await page.evaluate((message) => {
      window.__neudHostedUpdateMessage = message;
      window.__neudHostedBoot = null;
      window.__neudHostedAck = null;
      window.__neudHostedRenderStatus = null;
      const iframe = document.getElementById("display");
      function deliverUpdate() {
        iframe?.contentWindow?.postMessage(window.__neudHostedUpdateMessage, "*");
      }
      window.addEventListener("message", (event) => {
        if (event.data && event.data.type === "NEUD_HOSTED_BRIDGE_BOOTED") {
          window.__neudHostedBoot = event.data;
          deliverUpdate();
        }
        if (event.data && event.data.type === "NEUD_DATA_UPDATE_RECEIVED") {
          window.__neudHostedAck = event.data;
        }
        if (
          event.data &&
          event.data.type === "NEUD_RENDER_STATUS" &&
          event.data.renderCompleted === true
        ) {
          window.__neudHostedRenderStatus = event.data;
        }
      });
    }, updateMessage);

    const iframeHandle = await page.waitForSelector("#display");
    const frame = await iframeHandle?.contentFrame();
    assert.ok(frame, "iframe content frame should be available");

    await page.waitForFunction(() => Boolean(window.__neudHostedBoot), { timeout: 10000 });

    await frame.waitForFunction(() => {
      const lot = document.getElementById("lotNumber");
      const title = document.getElementById("vehicleTitle");
      const lotText = lot?.textContent || lot?.getAttribute("data-text") || "";
      const titleText = title?.textContent || title?.getAttribute("data-title") || "";
      return lotText.includes("101") && titleText.includes("2020 Example Lot");
    }, { timeout: 15000 });

    await page.waitForFunction(() => Boolean(window.__neudHostedAck), { timeout: 10000 });

    const ackStatus = await page.evaluate(() => ({
      ack: window.__neudHostedAck,
      renderStatus: window.__neudHostedRenderStatus,
    }));
    assert.ok(ackStatus.ack, "expected NEUD_DATA_UPDATE_RECEIVED ack");
    assert.equal(ackStatus.ack.runtimeGlobalPresent, true);
    assert.ok(ackStatus.ack.subscriberCount > 0, "expected runtime subscribers");
    if (ackStatus.renderStatus) {
      assert.equal(ackStatus.renderStatus.inputReceived, true);
      assert.equal(ackStatus.renderStatus.currentLotResolved, true);
      assert.equal(ackStatus.renderStatus.bidResolved, true);
      assert.equal(ackStatus.renderStatus.renderCompleted, true);
    }

    const fields = await frame.evaluate(() => {
      const lotNumber = document.getElementById("lotNumber");
      const vehicleTitle = document.getElementById("vehicleTitle");
      const primaryBid = document.getElementById("primaryBid");
      return {
        lotNumber:
          lotNumber?.textContent?.trim() ||
          lotNumber?.getAttribute("data-text")?.trim() ||
          "",
        vehicleTitle:
          vehicleTitle?.textContent?.trim() ||
          vehicleTitle?.getAttribute("data-title")?.trim() ||
          "",
        primaryBid:
          primaryBid?.textContent?.trim() ||
          primaryBid?.getAttribute("data-text")?.trim() ||
          "",
        currencyCount: document.querySelectorAll("#currencyList .currency-row").length,
        mainPhotoList: document.getElementById("mainPhoto")?.getAttribute("data-photo-list") ?? "",
        mainPhotoSrc:
          document.getElementById("mainPhoto")?.getAttribute("data-src") ||
          document.getElementById("mainPhoto")?.getAttribute("src") ||
          "",
        reserveStatus:
          document.getElementById("reserveStatus")?.textContent?.trim() ||
          document.getElementById("reserveStatus")?.getAttribute("data-text")?.trim() ||
          "",
      };
    });

    assert.match(fields.lotNumber, /101/);
    assert.match(fields.vehicleTitle, /2020 Example Lot/);
    assert.match(fields.primaryBid, /20,000/);
    assert.ok(fields.currencyCount >= 1 || fields.primaryBid.includes("20,000"));
    assert.match(fields.mainPhotoList, /example\.test\/photo\.jpg/);
    assert.match(fields.reserveStatus, /Reserve/i);
  } finally {
    await browser.close();
  }
});

test("hosted stream ticker path populates upcoming lot slots", async () => {
  const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
  const { transformStreamTickerHtmlForServing } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/displays/stream-display-v2-transform.js"),
    ).href
  );

  const rawHtml = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  const servedHtml = transformStreamTickerHtmlForServing(rawHtml);
  const preparedHtml = prepareHostedDisplayDocument(servedHtml);
  const updateMessage = buildNeudDataUpdateMessage({
    payload: {
      next: [
        { lot: "201", title: "First Upcoming Lot" },
        { lot: "202", title: "Second Upcoming Lot" },
        { lot: "203", title: "Third Upcoming Lot" },
      ],
    },
    revision: 2,
  });

  const { puppeteer, launchOptions } = await loadValidationPuppeteer();
  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 3840, height: 240, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000;"></body></html>`);
    await page.evaluate(() => {
      const iframe = document.createElement("iframe");
      iframe.id = "display";
      iframe.title = "Stream Ticker";
      iframe.sandbox = "allow-scripts";
      iframe.style.width = "3840px";
      iframe.style.height = "240px";
      iframe.style.border = "0";
      document.body.appendChild(iframe);
    });

    await page.evaluate((message) => {
      window.__neudHostedUpdateMessage = message;
      const iframe = document.getElementById("display");
      function deliverUpdate() {
        iframe?.contentWindow?.postMessage(window.__neudHostedUpdateMessage, "*");
      }
      window.addEventListener("message", (event) => {
        if (event.data && event.data.type === "NEUD_DISPLAY_READY") {
          deliverUpdate();
        }
      });
      iframe?.addEventListener("load", () => {
        window.setTimeout(deliverUpdate, 50);
      });
    }, updateMessage);

    const iframeHandle = await page.$("#display");
    const frame = await iframeHandle?.contentFrame();
    assert.ok(frame, "iframe content frame should be available");
    await frame.setContent(preparedHtml, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      const iframe = document.getElementById("display");
      iframe?.contentWindow?.postMessage(window.__neudHostedUpdateMessage, "*");
    });

    await frame.waitForFunction(() => {
      const slot1 = document.getElementById("slot1");
      const slotText = slot1?.textContent || slot1?.getAttribute("data-text") || "";
      return slotText.includes("201");
    }, { timeout: 15000 });

    const slotText = await frame.evaluate(() => ({
      slot1: document.getElementById("slot1")?.textContent?.trim() ?? "",
      slot2: document.getElementById("slot2")?.textContent?.trim() ?? "",
    }));

    assert.match(slotText.slot1, /201/);
    assert.match(slotText.slot1, /First Upcoming Lot/);
    assert.match(slotText.slot2, /202/);
  } finally {
    await browser.close();
  }
});

test("diagnostics panel exposes stage fields without canonical values", () => {
  const panel = read("src/components/hosted/HostedViewerDiagnosticsPanel.tsx");
  assert.match(panel, /displayReadyReceived/);
  assert.match(panel, /hostedBridgeBooted/);
  assert.match(panel, /dataUpdateAttempts/);
  assert.match(panel, /lastRejectionReason/);
  assert.match(panel, /payloadTopLevelKeys/);
  assert.match(panel, /dataUpdateAckReceived/);
  assert.match(panel, /renderStatusReceived/);
  assert.match(panel, /iframeUpdateReceived/);
  assert.match(panel, /renderUpdateCompleted/);
  assert.match(panel, /runtimeSubscribersCount/);
  assert.match(panel, /streamBidInputReceived/);
  assert.doesNotMatch(panel, /bundle\.canonicalPayload/);
});

test("hosted viewer iframe uses allow-scripts sandbox without allow-same-origin", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.match(client, /sandbox="allow-scripts"/);
  assert.doesNotMatch(client, /allow-same-origin/);
});

test("NEUD_DATA_UPDATE_RECEIVED ack messages are recognized", () => {
  const ack = {
    source: "neud-runtime",
    type: "NEUD_DATA_UPDATE_RECEIVED",
    version: 1,
    revision: 4,
    runtimeGlobalPresent: true,
    subscriberCount: 2,
  };
  assert.equal(isNeudDataUpdateReceivedMessage(ack), true);
});

test("NEUD_RENDER_STATUS messages are recognized", () => {
  const status = {
    source: "neud-runtime",
    type: "NEUD_RENDER_STATUS",
    version: 1,
    revision: 4,
    adapter: "stream-bid-v2-bridge",
    inputReceived: true,
    currentLotResolved: true,
    bidResolved: true,
    photoCount: 1,
    renderCompleted: true,
    skipReason: null,
  };
  assert.equal(isNeudRenderStatusMessage(status), true);
});

test("hosted inbound bridge sends NEUD_DATA_UPDATE_RECEIVED ack to parent", () => {
  const sandbox = {
    messageHandler: null,
    parentMessages: [],
    subscriberCalls: [],
    console,
    window: {},
  };

  sandbox.window = {
    __NEUD_DISPLAY_DATA_DISCONNECTED__: true,
    parent: {
      postMessage(payload, targetOrigin) {
        sandbox.parentMessages.push({ payload, targetOrigin });
      },
    },
    location: { origin: "null", search: "" },
    addEventListener(type, handler) {
      if (type === "message") {
        sandbox.messageHandler = handler;
      }
    },
    NEUDDisplay: {
      _subscribers: [],
      _snapshot: null,
      subscribe(callback) {
        this._subscribers.push(callback);
        return () => {};
      },
      _publish(snapshot) {
        this._snapshot = snapshot;
        for (const callback of this._subscribers) {
          sandbox.subscriberCalls.push(snapshot);
          callback(snapshot);
        }
      },
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(DISPLAY_BRIDGE_SCRIPT, sandbox);
  vm.runInContext(HOSTED_BRIDGE_INBOUND_SCRIPT, sandbox);

  const bootMessage = sandbox.parentMessages.find(
    (entry) => entry.payload?.type === "NEUD_HOSTED_BRIDGE_BOOTED",
  );
  assert.ok(bootMessage, "expected NEUD_HOSTED_BRIDGE_BOOTED on install");

  sandbox.messageHandler({
    origin: "https://preview.example.vercel.app",
    source: sandbox.window.parent,
    data: buildNeudDataUpdateMessage({
      payload: REPRESENTATIVE_CANONICAL,
      revision: 4,
    }),
  });

  const ack = sandbox.parentMessages.find(
    (entry) => entry.payload && entry.payload.type === "NEUD_DATA_UPDATE_RECEIVED",
  );
  assert.ok(ack, "expected NEUD_DATA_UPDATE_RECEIVED ack");
  assert.equal(ack.payload.runtimeGlobalPresent, true);
  assert.equal(ack.payload.subscriberCount, 0);
  assert.equal(ack.payload.revision, 4);
});

test("hosted viewer rejects stale iframe READY after revision replacement", async () => {
  const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
  const { transformStreamBidHtmlForServing } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/displays/stream-display-v2-transform.js"),
    ).href
  );

  const rawHtml = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const servedHtml = transformStreamBidHtmlForServing(rawHtml);
  const preparedHtml = prepareHostedDisplayDocument(servedHtml);
  const updateRevision5 = buildNeudDataUpdateMessage({
    payload: REPRESENTATIVE_CANONICAL,
    revision: 5,
  });
  const updateRevision6 = buildNeudDataUpdateMessage({
    payload: {
      ...REPRESENTATIVE_CANONICAL,
      current: { ...REPRESENTATIVE_CANONICAL.current, lot: "106" },
    },
    revision: 6,
  });

  const { puppeteer, launchOptions } = await loadValidationPuppeteer();
  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000;"></body></html>`);

    await page.evaluate(
      ({ html, message5, message6 }) => {
        window.__messages = { message5, message6 };
        window.__state = {
          staleReadyIgnored: false,
          bootCount: 0,
          ackRevision: null,
        };

        function mountIframe(revisionKey, htmlContent) {
          const existing = document.getElementById("display");
          existing?.remove();
          const iframe = document.createElement("iframe");
          iframe.id = "display";
          iframe.dataset.revisionKey = revisionKey;
          iframe.sandbox = "allow-scripts";
          iframe.srcdoc = htmlContent;
          iframe.style.width = "3840px";
          iframe.style.height = "2160px";
          iframe.style.border = "0";
          document.body.appendChild(iframe);
          return iframe;
        }

        let activeIframe = mountIframe("rev-5", html);
        let activeWindow = activeIframe.contentWindow;
        const staleWindow = activeWindow;

        window.addEventListener("message", (event) => {
          if (event.source === staleWindow && event.data?.type === "NEUD_DISPLAY_READY") {
            window.__state.staleReadyIgnored = true;
            staleWindow.postMessage(window.__messages.message5, "*");
          }
          if (event.source !== activeWindow) {
            return;
          }
          if (event.data?.type === "NEUD_HOSTED_BRIDGE_BOOTED") {
            window.__state.bootCount += 1;
            activeWindow.postMessage(
              window.__state.bootCount === 1
                ? window.__messages.message5
                : window.__messages.message6,
              "*",
            );
          }
          if (event.data?.type === "NEUD_DATA_UPDATE_RECEIVED") {
            window.__state.ackRevision = event.data.revision;
          }
        });

        window.setTimeout(() => {
          activeIframe = mountIframe("rev-6", html);
          activeWindow = activeIframe.contentWindow;
        }, 300);
      },
      { html: preparedHtml, message5: updateRevision5, message6: updateRevision6 },
    );

    await page.waitForFunction(
      () => window.__state.bootCount >= 2 && window.__state.ackRevision === 6,
      { timeout: 15000 },
    );

    const state = await page.evaluate(() => window.__state);
    assert.equal(state.ackRevision, 6);
    assert.ok(state.bootCount >= 2);
  } finally {
    await browser.close();
  }
});

test("signalReady posts NEUD_DISPLAY_READY to parent in hosted mode", () => {
  const sandbox = {
    parentMessages: [],
    window: {},
  };

  sandbox.window = {
    __NEUD_DISPLAY_DATA_DISCONNECTED__: true,
    parent: {
      postMessage(payload, targetOrigin) {
        sandbox.parentMessages.push({ payload, targetOrigin });
      },
    },
    location: { origin: "null", search: "" },
  };

  vm.createContext(sandbox);
  vm.runInContext(DISPLAY_BRIDGE_SCRIPT, sandbox);
  sandbox.window.NEUDDisplay.signalReady();

  assert.equal(sandbox.parentMessages.length, 1);
  assert.equal(sandbox.parentMessages[0].payload.type, "NEUD_DISPLAY_READY");
  assert.equal(sandbox.parentMessages[0].payload.source, "neud-display");
});
