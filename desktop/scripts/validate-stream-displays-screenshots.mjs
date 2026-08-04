#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadValidationPuppeteer,
  toFileUrl,
} from "./lib/resolve-validation-browser.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outputDir = path.join(repoRoot, "desktop", "validation-output", "stream-displays");
const assetsDir = path.join(outputDir, "assets");

export const CANVAS_WIDTH = 3840;
export const CANVAS_HEIGHT = 2160;
export const TICKER_HEIGHT = 240;

export const OUTPUT_PNGS = {
  bid: "stream-bid-display.png",
  tickerAlpha: "stream-ticker-alpha-check.png",
  composite: "stream-composite.png",
  pipAlpha: "stream-bid-pip-alpha-check.png",
};

const SAMPLE_VEHICLE_PHOTOS = [
  "https://cdn.dealeraccelerate.com/bagauction/31/5296/254385/790x1024/original-michael-schumacher-oil-paintings",
  "https://cdn.dealeraccelerate.com/bagauction/31/5296/254387/790x1024/original-michael-schumacher-oil-paintings",
  "https://cdn.dealeraccelerate.com/bagauction/31/5296/254388/790x1024/original-michael-schumacher-oil-paintings",
  "https://cdn.dealeraccelerate.com/bagauction/31/5296/254389/790x1024/original-michael-schumacher-oil-paintings",
  "https://cdn.dealeraccelerate.com/bagauction/31/5296/254386/790x1024/original-michael-schumacher-oil-paintings",
];

const sampleBidPayload = {
  broadArrowDisplay: {
    pylon: {
      lot: "Lot 999",
      title: "Talbot Lago T150 C Lago Speciale Teardrop Coupe",
      year: "1938",
      reserveStatus: "Offered Without Reserve",
      biddingPrice: "$44,000,000",
      currencies: [
        "EUR 38.635.520",
        "GBP 32,926,300",
        "CHF 35'802'800",
        "JPY 7,147,052,000",
      ],
      photos: SAMPLE_VEHICLE_PHOTOS,
    },
  },
};

const blankBidPayload = {
  broadArrowDisplay: {
    pylon: {
      lot: "Lot 999",
      title: "Talbot Lago T150 C Lago Speciale Teardrop Coupe",
      year: "1938",
      reserveStatus: "Offered Without Reserve",
      biddingPrice: "",
      currencies: [],
      photos: SAMPLE_VEHICLE_PHOTOS,
    },
  },
};

const populatedBidView = blankBidPayload.broadArrowDisplay.pylon;

const TITLE_FIXTURE_TITLES = {
  short: "1976 Cadillac Eldorado Convertible",
  medium: "1955 Mercedes-Benz 300 SL Gullwing Alloy Body",
  exactly50: "12345678901234567890123456789012345678901234567890",
  long:
    "1967 Ferrari 275 GTB/4 by Scaglietti Formerly Owned by Steve McQueen with Complete Documentation and Matching Numbers Throughout",
};

const sampleTickerPayload = {
  next: [
    { lot: "101", title: "1976 Cadillac Eldorado Convertible" },
    { lot: "102", title: "2001 Ferrari 550 Barchetta Pininfarina" },
    { lot: "103", title: "1967 Shelby GT500" },
    { lot: "104", title: "Should Not Appear" },
  ],
};

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function rewriteFixtureAssetPaths(html) {
  return html.replace(/\/displays\/pylon\/logo\.png/g, "./assets/logo.png");
}

function injectNeudDisplayBootstrap(html, payload) {
  const bootstrap = `<script>
window.NEUDDisplay = {
  getSnapshot: () => (${JSON.stringify(payload)}),
  subscribe(callback) {
    callback(${JSON.stringify(payload)});
  },
  signalReady() {}
};
</script>`;
  return html.replace("<body>", `<body>\n${bootstrap}`);
}

export function buildBidFixtureHtml(payload = sampleBidPayload) {
  const base = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const bridge = read("desktop/src/displays/stream-bid-v2-bridge.js");
  return rewriteFixtureAssetPaths(
    injectNeudDisplayBootstrap(
      base
        .replace("/*__NEUD_STREAM_BID_BRIDGE__*/", bridge),
      payload,
    ),
  );
}

function buildBidAnimationFixtureHtml() {
  return buildBidFixtureHtml(blankBidPayload);
}

function injectLegacyTickerMarquee(html) {
  const marquee = read("desktop/src/displays/legacy-ticker-marquee.js");
  return html.replace("/*__NEUD_LEGACY_TICKER_MARQUEE__*/", marquee);
}

export function buildTickerFixtureHtml() {
  const base = injectLegacyTickerMarquee(
    read("desktop/src/displays/bundled/stream-ticker-v1.html"),
  );
  const bridge = read("desktop/src/displays/stream-ticker-v2-bridge.js");
  return rewriteFixtureAssetPaths(
    injectNeudDisplayBootstrap(
      base.replace("/*__NEUD_STREAM_TICKER_BRIDGE__*/", bridge),
      sampleTickerPayload,
    ),
  );
}

export function buildBareTickerFixtureHtml() {
  const base = injectLegacyTickerMarquee(
    read("desktop/src/displays/bundled/stream-ticker-v1.html"),
  );
  return rewriteFixtureAssetPaths(
    base.replace("/*__NEUD_STREAM_TICKER_BRIDGE__*/", ""),
  );
}

function buildWrapperHtml(bodyMarkup) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  html, body {
    margin: 0;
    width: ${CANVAS_WIDTH}px;
    height: ${CANVAS_HEIGHT}px;
    overflow: hidden;
  }
</style>
</head>
<body>
${bodyMarkup}
</body>
</html>`;
}

function buildTickerAlphaWrapperHtml(tickerFixtureName) {
  return buildWrapperHtml(`
<style>
  body {
    background:
      linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%, #666),
      linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%, #666);
    background-size: 80px 80px;
    background-position: 0 0, 40px 40px;
    background-color: #999;
  }
  iframe {
    position: absolute;
    inset: 0;
    border: 0;
    width: ${CANVAS_WIDTH}px;
    height: ${CANVAS_HEIGHT}px;
    background: transparent;
  }
</style>
<iframe src="${tickerFixtureName}"></iframe>`);
}

function buildCompositeWrapperHtml(bidFixtureName, tickerFixtureName) {
  return buildWrapperHtml(`
<style>
  body { background: #ffffff; }
  iframe {
    position: absolute;
    inset: 0;
    border: 0;
    width: ${CANVAS_WIDTH}px;
    height: ${CANVAS_HEIGHT}px;
    background: transparent;
  }
</style>
<iframe src="${bidFixtureName}"></iframe>
<iframe src="${tickerFixtureName}" style="pointer-events:none;"></iframe>`);
}

function buildPipAlphaWrapperHtml(bidFixtureName) {
  return buildWrapperHtml(`
<style>
  body {
    background:
      repeating-conic-gradient(#ff00ff 0 25%, #00ffff 0 50%) 0 0 / 120px 120px;
  }
  iframe {
    position: absolute;
    inset: 0;
    border: 0;
    width: ${CANVAS_WIDTH}px;
    height: ${CANVAS_HEIGHT}px;
    background: transparent;
  }
</style>
<iframe src="${bidFixtureName}"></iframe>`);
}

async function capturePipAlphaScreenshot(page, bidFixturePath, outputPath) {
  await page.setViewport({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    deviceScaleFactor: 1,
  });
  await page.goto(toFileUrl(bidFixturePath), { waitUntil: "networkidle0", timeout: 60000 });
  await waitForDisplayReady(page);
  await page.evaluate(() => {
    document.documentElement.style.background =
      "repeating-conic-gradient(#ff00ff 0 25%, #00ffff 0 50%) 0 0 / 120px 120px";
    document.body.style.background = "transparent";
  });
  await page.screenshot({
    path: outputPath,
    omitBackground: true,
    clip: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
  });
}

function prepareFixtureAssets() {
  fs.mkdirSync(assetsDir, { recursive: true });
  const logoSource = path.join(repoRoot, "public", "displays", "pylon", "logo.png");
  const logoTarget = path.join(assetsDir, "logo.png");
  if (!fs.existsSync(logoSource)) {
    throw new Error(`Missing Broad Arrow logo asset at ${logoSource}`);
  }
  fs.copyFileSync(logoSource, logoTarget);
}

async function waitForDisplayReady(page) {
  async function waitForFrameContent(frame) {
    await frame.waitForSelector(".display-stage", { timeout: 20000 });
    await frame.waitForFunction(
      () => {
        const lot = document.getElementById("lotNumber");
        if (lot && lot.textContent && lot.textContent !== "Lot —") {
          return true;
        }
        const slot1 = document.getElementById("slot1");
        if (slot1 && !slot1.classList.contains("hidden")) {
          return true;
        }
        return false;
      },
      { timeout: 20000 },
    );
    await frame.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });
  }

  const frames = page.frames();
  if (frames.length > 1) {
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue;
      await waitForFrameContent(frame);
    }
  } else {
    await waitForFrameContent(page.mainFrame());
  }

  await new Promise((resolve) => setTimeout(resolve, 800));
}

async function collectBidAnimationState(page) {
  return page.evaluate(() => {
    const bidBlock = document.getElementById("bidBlock");
    const primaryBid = document.getElementById("primaryBid");
    const currencyRows = Array.from(document.querySelectorAll(".currency-row"));
    const stage = document.getElementById("stage");
    const scale = stage ? stage.getBoundingClientRect().width / 3840 : 1;

    function rowGap(topA, heightA, topB) {
      return Math.round((topB - (topA + heightA)) / scale);
    }

    const rowMetrics = currencyRows.map((row) => {
      const rect = row.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      return {
        top: Math.round((rect.top - stageRect.top) / scale),
        height: Math.round(rect.height / scale),
        pillHidden: row.classList.contains("pill-hidden"),
      };
    });

    const gaps = [];
    for (let i = 1; i < rowMetrics.length; i += 1) {
      gaps.push(rowGap(rowMetrics[i - 1].top, rowMetrics[i - 1].height, rowMetrics[i].top));
    }

    const lot = document.getElementById("lotNumber");
    const reserve = document.getElementById("reserveStatus");
    const title = document.getElementById("vehicleTitle");
    const lotRect = lot ? lot.getBoundingClientRect() : null;
    const reserveRect = reserve ? reserve.getBoundingClientRect() : null;
    const bidRect = primaryBid ? primaryBid.getBoundingClientRect() : null;
    const stageRect = stage.getBoundingClientRect();

    return {
      bidBlockCollapsed: bidBlock.classList.contains("collapsed"),
      bidText: primaryBid.textContent || "",
      bidPillHidden: primaryBid.classList.contains("pill-hidden"),
      currencyRowCount: currencyRows.length,
      currencyRowGaps: gaps,
      currencyRowsPillHidden: currencyRows.map((row) => row.classList.contains("pill-hidden")),
      lotVisible: Boolean(lot && lot.textContent && lot.textContent !== "Lot —"),
      reserveText: reserve ? reserve.textContent || "" : "",
      reserveHidden: reserve ? reserve.classList.contains("hidden") : true,
      reservePlaceholder: reserve ? reserve.classList.contains("placeholder") : false,
      reserveVisible: Boolean(reserve && !reserve.classList.contains("hidden") && reserve.textContent),
      reserveHeight: reserveRect ? Math.round(reserveRect.height / scale) : 0,
      reserveMarginBottom: reserve
        ? Math.round(parseFloat(getComputedStyle(reserve).marginBottom) / scale)
        : 0,
      lotToBidGap:
        lotRect && bidRect
          ? Math.round((bidRect.top - (lotRect.top + lotRect.height)) / scale)
          : null,
      titleVisible: Boolean(title && (title.getAttribute("data-title") || "").trim()),
      computedCurrencyGap: getComputedStyle(document.querySelector(".currency-list") || document.body)
        .gap,
    };
  });
}

function renderFeedPayload(pylon) {
  return {
    auctionDisplay: {
      lot: pylon.lot,
      title: pylon.title,
      year: pylon.year,
      reserveStatus: pylon.reserveStatus,
      biddingPrice: pylon.biddingPrice || null,
      currencies: Array.isArray(pylon.currencies) ? pylon.currencies : [],
      photos: Array.isArray(pylon.photos) ? pylon.photos : [],
    },
  };
}

export async function validateInitialPopulatedLoad(browser, bidFixturePath) {
  const page = await browser.newPage();
  await page.setViewport({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    deviceScaleFactor: 1,
  });
  await page.evaluateOnNewDocument(() => {
    window.__streamBidEntrancePhaseLog = [];
    window.__streamBidEntranceFrames = function (payload) {
      if (!Array.isArray(window.__streamBidEntrancePhaseLog)) {
        window.__streamBidEntrancePhaseLog = [];
      }
      window.__streamBidEntrancePhaseLog.push(payload);
    };
  });
  await page.goto(toFileUrl(bidFixturePath), { waitUntil: "networkidle0", timeout: 60000 });
  await waitForDisplayReady(page);

  const afterBridgeLoad = await collectBidAnimationState(page);
  const initialEntrancePhases = await page.evaluate(() =>
    Array.isArray(window.__streamBidEntrancePhaseLog)
      ? window.__streamBidEntrancePhaseLog.slice()
      : [],
  );

  await page.evaluate((payload) => {
    window.render(payload);
    window.render(payload);
  }, renderFeedPayload(sampleBidPayload.broadArrowDisplay.pylon));

  await new Promise((resolve) => setTimeout(resolve, 1200));
  const afterDoubleRender = await collectBidAnimationState(page);
  await page.close();

  return { afterBridgeLoad, afterDoubleRender, initialEntrancePhases };
}

export async function validateBidAnimationSequence(browser, bidAnimationFixturePath) {
  const page = await browser.newPage();
  await page.setViewport({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    deviceScaleFactor: 1,
  });
  await page.goto(toFileUrl(bidAnimationFixturePath), { waitUntil: "networkidle0", timeout: 60000 });
  await waitForDisplayReady(page);

  const results = {};

  results.initialBlank = await collectBidAnimationState(page);
  results.initialBlank.currencyGapPx = parseFloat(results.initialBlank.computedCurrencyGap) || null;

  const populatedPayload = renderFeedPayload({
    ...populatedBidView,
    biddingPrice: "$44,000,000",
    currencies: sampleBidPayload.broadArrowDisplay.pylon.currencies,
  });

  await page.evaluate((payload) => {
    window.render(payload);
  }, populatedPayload);

  await new Promise((resolve) => setTimeout(resolve, 450));
  results.firstBidEntering = await collectBidAnimationState(page);

  await new Promise((resolve) => setTimeout(resolve, 900));
  results.firstBidVisible = await collectBidAnimationState(page);

  await page.evaluate((payload) => {
    window.render(payload);
  }, populatedPayload);

  await new Promise((resolve) => setTimeout(resolve, 200));
  results.repeatedBid = await collectBidAnimationState(page);

  await page.evaluate((payload) => {
    window.render(payload);
  }, renderFeedPayload({
    ...populatedBidView,
    biddingPrice: "",
    currencies: [],
  }));

  await page.evaluate((payload) => {
    window.render(payload);
  }, populatedPayload);

  await new Promise((resolve) => setTimeout(resolve, 200));
  results.rapidBlankToPopulated = await collectBidAnimationState(page);

  await new Promise((resolve) => setTimeout(resolve, 1200));
  results.rapidBlankToPopulatedSettled = await collectBidAnimationState(page);

  await page.evaluate((payload) => {
    window.render(payload);
  }, renderFeedPayload({
    ...populatedBidView,
    biddingPrice: "",
    currencies: [],
  }));

  await new Promise((resolve) => setTimeout(resolve, 200));
  results.bidClearing = await collectBidAnimationState(page);

  await new Promise((resolve) => setTimeout(resolve, 400));
  results.bidCleared = await collectBidAnimationState(page);

  await page.evaluate((payload) => {
    window.render(payload);
  }, populatedPayload);

  await new Promise((resolve) => setTimeout(resolve, 450));
  results.bidReentered = await collectBidAnimationState(page);

  await new Promise((resolve) => setTimeout(resolve, 900));
  results.bidReenteredVisible = await collectBidAnimationState(page);

  await page.evaluate((payload) => {
    window.render(payload);
  }, renderFeedPayload({
    ...populatedBidView,
    reserveStatus: "Has Reserve",
    biddingPrice: "$44,000,000",
    currencies: sampleBidPayload.broadArrowDisplay.pylon.currencies,
  }));

  await new Promise((resolve) => setTimeout(resolve, 400));
  results.hasReserve = await collectBidAnimationState(page);

  await page.evaluate((payload) => {
    window.render(payload);
  }, renderFeedPayload({
    ...populatedBidView,
    reserveStatus: "Offered Without Reserve",
    biddingPrice: "$44,000,000",
    currencies: sampleBidPayload.broadArrowDisplay.pylon.currencies,
  }));

  await new Promise((resolve) => setTimeout(resolve, 400));
  results.offeredWithoutReserve = await collectBidAnimationState(page);

  await page.close();
  return results;
}

async function collectTypographyMetrics(page) {
  return page.evaluate(() => {
    function sample(id) {
      const el = document.getElementById(id);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const stage = document.getElementById("stage").getBoundingClientRect();
      const scale = stage.width / 3840;
      return {
        top: Math.round((rect.top - stage.top) / scale),
        height: Math.round(rect.height / scale),
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        fontFamily: cs.fontFamily,
        marginBottom: cs.marginBottom,
      };
    }

    const rows = Array.from(document.querySelectorAll(".currency-row")).map((row, index) => {
      const code = row.querySelector(".currency-code");
      const value = row.querySelector(".currency-value");
      const rowRect = row.getBoundingClientRect();
      const stage = document.getElementById("stage").getBoundingClientRect();
      const scale = stage.width / 3840;
      const codeRect = code.getBoundingClientRect();
      const valueRect = value.getBoundingClientRect();
      return {
        index,
        top: Math.round((rowRect.top - stage.top) / scale),
        height: Math.round(rowRect.height / scale),
        codeLeft: Math.round((codeRect.left - stage.left) / scale),
        valueLeft: Math.round((valueRect.left - stage.left) / scale),
        codeToValueGap: Math.round((valueRect.left - codeRect.right) / scale),
      };
    });

    function sampleTitle() {
      const container = document.getElementById("vehicleTitle");
      const track = container ? container.querySelector(".title-scroll-track") : null;
      if (!container || !track) return null;
      const cs = getComputedStyle(track);
      const rect = container.getBoundingClientRect();
      const stage = document.getElementById("stage").getBoundingClientRect();
      const scale = stage.width / 3840;
      return {
        top: Math.round((rect.top - stage.top) / scale),
        height: Math.round(rect.height / scale),
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        fontFamily: cs.fontFamily,
        scrollMode: container.getAttribute("data-title-mode") === "scroll",
        measuring: container.classList.contains("title-measuring"),
      };
    }

    return {
      fontFamily: getComputedStyle(document.body).fontFamily,
      lot: sample("lotNumber"),
      reserve: sample("reserveStatus"),
      bid: sample("primaryBid"),
      title: sampleTitle(),
      currencyRows: rows,
    };
  });
}

async function collectTitleState(page) {
  return page.evaluate(() => {
    const container = document.getElementById("vehicleTitle");
    const track = container ? container.querySelector(".title-scroll-track") : null;
    const viewport = container ? container.querySelector(".title-scroll-viewport") : null;
    if (!container || !track) return null;
    const cs = getComputedStyle(track);
    const viewportCs = viewport ? getComputedStyle(viewport) : null;
    return {
      text: container.getAttribute("data-title") || "",
      fontSize: parseFloat(cs.fontSize) || 0,
      measuring: container.classList.contains("title-measuring"),
      scrollMode: container.getAttribute("data-title-mode") === "scroll",
      hasLoopCopy: Boolean(track.querySelector(".copyA")),
      trackTransform: track.style.transform || "",
      viewportOverflowX: viewportCs ? viewportCs.overflowX : "",
      viewportOverflowY: viewportCs ? viewportCs.overflowY : "",
      viewportScrollbarWidth: viewportCs ? viewportCs.scrollbarWidth : "",
      containerOverflow: getComputedStyle(container).overflow,
    };
  });
}

export async function validateBidLotSequence(browser, bidFixturePath) {
  const page = await browser.newPage();
  await page.setViewport({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    deviceScaleFactor: 1,
  });
  await page.goto(toFileUrl(bidFixturePath), { waitUntil: "networkidle0", timeout: 60000 });
  await waitForDisplayReady(page);

  const lotACurrencies = sampleBidPayload.broadArrowDisplay.pylon.currencies;
  const lotBCurrencies = [
    "EUR 109,375",
    "GBP 93,125",
    "CHF 101,250",
    "JPY 20,218,750",
  ];

  async function renderLot(input) {
    await page.evaluate(
      (payload) => {
        window.render(payload);
      },
      renderFeedPayload({
        ...populatedBidView,
        year: "",
        lot: input.lot,
        title: input.title,
        biddingPrice: input.biddingPrice,
        currencies: input.currencies,
      }),
    );
  }

  async function captureBidLayers() {
    return page.evaluate(() => {
      const bid = document.getElementById("primaryBid");
      const block = document.getElementById("bidBlock");
      const primaryOpacity = bid ? getComputedStyle(bid).opacity : "";
      const pills = Array.from(document.querySelectorAll(".primary-bid, .currency-row"));
      return {
        bidText: bid ? bid.textContent || "" : "",
        dataBid: bid ? bid.getAttribute("data-text") || "" : "",
        collapsed: block ? block.classList.contains("collapsed") : true,
        isEnterPrep: block ? block.classList.contains("is-enter-prep") : false,
        isEntering: block ? block.classList.contains("is-entering") : false,
        isVisible: block ? block.classList.contains("is-visible") : false,
        primaryOpacity,
        currencyValues: Array.from(document.querySelectorAll(".currency-value")).map(
          (el) => el.textContent || "",
        ),
        pillHidden: pills.map((el) => el.classList.contains("pill-hidden")),
        allPillsHidden: pills.length > 0 && pills.every((el) => el.classList.contains("pill-hidden")),
        entranceChecks: Array.isArray(window.__streamBidEntranceChecks)
          ? window.__streamBidEntranceChecks.slice()
          : [],
        entrancePhases: Array.isArray(window.__streamBidEntrancePhaseLog)
          ? window.__streamBidEntrancePhaseLog.slice()
          : [],
      };
    });
  }

  await page.evaluate(() => {
    window.__streamBidEntranceChecks = [];
    window.__streamBidEntrancePhaseLog = [];
    window.__streamBidValidateEntrance = function (payload) {
      window.__streamBidEntranceChecks.push(payload);
    };
    window.__streamBidEntranceFrames = function (payload) {
      window.__streamBidEntrancePhaseLog.push(payload);
    };
  });

  await renderLot({
    lot: "Lot 101",
    title: "Lot A Vehicle",
    biddingPrice: "$44,000,000",
    currencies: lotACurrencies,
  });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const lotAWithBid = await collectBidAnimationState(page);

  await renderLot({
    lot: "Lot 102",
    title: "Lot B Vehicle",
    biddingPrice: "",
    currencies: [],
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  const lotBFading = await page.evaluate(() => {
    const pills = Array.from(document.querySelectorAll(".primary-bid, .currency-row"));
    return {
      bidExitFade: pills.some((pill) => pill.classList.contains("bid-exit-fade")),
      bidText: document.getElementById("primaryBid")?.textContent || "",
    };
  });

  await new Promise((resolve) => setTimeout(resolve, 400));
  const lotBCleared = await collectBidAnimationState(page);
  const lotBClearedLayers = await captureBidLayers();

  await page.evaluate(() => {
    window.__streamBidEntranceChecks = [];
    window.__streamBidEntrancePhaseLog = [];
  });

  await renderLot({
    lot: "Lot 102",
    title: "Lot B Vehicle",
    biddingPrice: "$125,000",
    currencies: lotBCurrencies,
  });

  await page.waitForFunction(
    () =>
      Array.isArray(window.__streamBidEntrancePhaseLog) &&
      window.__streamBidEntrancePhaseLog.some((entry) => entry.phase === "before-reveal"),
    { timeout: 2000 },
  );

  const lotBEntrancePhases = await page.evaluate(() =>
    Array.isArray(window.__streamBidEntrancePhaseLog)
      ? window.__streamBidEntrancePhaseLog.slice()
      : [],
  );

  const lotBEntranceFrames = [];
  for (const delay of [0, 16, 50, 100, 400, 1200]) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    lotBEntranceFrames.push({
      delayMs: delay,
      ...(await captureBidLayers()),
    });
  }

  const lotBFirstBidEarly = lotBEntranceFrames.find((frame) => frame.delayMs === 100) || lotBEntranceFrames[3];
  const lotBFirstBidSettled = lotBEntranceFrames[lotBEntranceFrames.length - 1];

  await renderLot({
    lot: "Lot 103",
    title: "Lot C Vehicle",
    biddingPrice: "",
    currencies: [],
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await renderLot({
    lot: "Lot 104",
    title: "Lot D Vehicle",
    biddingPrice: "$250,000",
    currencies: ["EUR 218,750"],
  });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const rapidLotD = await collectBidAnimationState(page);

  await renderLot({
    lot: "Lot 101",
    title: "Lot A Vehicle",
    biddingPrice: "$44,000,000",
    currencies: lotACurrencies,
  });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await renderLot({
    lot: "Lot 105",
    title: "Lot E Vehicle",
    biddingPrice: "",
    currencies: [],
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await renderLot({
    lot: "Lot 105",
    title: "Lot E Vehicle",
    biddingPrice: "$500,000",
    currencies: ["EUR 437,500"],
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const bidBeforeFadeCompletes = await captureBidLayers();

  await page.close();
  return {
    lotAWithBid,
    lotBFading,
    lotBCleared,
    lotBClearedLayers,
    lotBEntrancePhases,
    lotBEntranceFrames,
    lotBFirstBidEarly,
    lotBFirstBidSettled,
    rapidLotD,
    bidBeforeFadeCompletes,
  };
}

export async function validateHeaderLotSequence(browser, bidFixturePath) {
  const page = await browser.newPage();
  await page.setViewport({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    deviceScaleFactor: 1,
  });
  await page.goto(toFileUrl(bidFixturePath), { waitUntil: "networkidle0", timeout: 60000 });
  await waitForDisplayReady(page);

  await page.evaluate(() => {
    window.__streamHeaderPhaseLog = [];
    window.__streamHeaderFrames = function (payload) {
      window.__streamHeaderPhaseLog.push(payload);
    };
  });

  async function renderHeaderLot(input) {
    await page.evaluate(
      (payload) => {
        window.render(payload);
      },
      renderFeedPayload({
        ...populatedBidView,
        year: "",
        lot: input.lot,
        title: input.title,
        reserveStatus: input.reserveStatus,
        biddingPrice: "",
        currencies: [],
      }),
    );
  }

  async function snapshotHeader() {
    return page.evaluate(() => {
      const lot = document.getElementById("lotNumber");
      const reserve = document.getElementById("reserveStatus");
      return {
        lotText: lot ? lot.textContent || "" : "",
        reserveText: reserve ? reserve.textContent || "" : "",
        reserveHidden: reserve ? reserve.classList.contains("hidden") : true,
        reservePlaceholder: reserve ? reserve.classList.contains("placeholder") : false,
        reserveVisible:
          Boolean(reserve) &&
          !reserve.classList.contains("hidden") &&
          !reserve.classList.contains("header-enter-prep") &&
          Boolean(reserve.textContent),
        lotFadeOut: lot ? lot.classList.contains("fade-out") : false,
        reserveFadeOut: reserve ? reserve.classList.contains("fade-out") : false,
        lotSlideIn: lot ? lot.classList.contains("slide-in-right") : false,
        reserveSlideIn: reserve ? reserve.classList.contains("slide-in-right") : false,
        lotEnterPrep: lot ? lot.classList.contains("header-enter-prep") : false,
        reserveEnterPrep: reserve ? reserve.classList.contains("header-enter-prep") : false,
      };
    });
  }

  async function waitForHeaderSettled(expectedLot) {
    await page.waitForFunction(
      (lotText) => {
        const lot = document.getElementById("lotNumber");
        return (
          lot &&
          lot.textContent === lotText &&
          !lot.classList.contains("fade-out") &&
          !lot.classList.contains("slide-in-right") &&
          !lot.classList.contains("header-enter-prep")
        );
      },
      { timeout: 5000 },
      expectedLot,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  await renderHeaderLot({
    lot: "Lot 101",
    title: "Lot A Vehicle",
    reserveStatus: "Offered Without Reserve",
  });
  await waitForHeaderSettled("Lot 101");
  const lot101Settled = await snapshotHeader();
  const lot101Phases = await page.evaluate(() =>
    Array.isArray(window.__streamHeaderPhaseLog) ? window.__streamHeaderPhaseLog.slice() : [],
  );

  await page.evaluate(() => {
    window.__streamHeaderPhaseLog = [];
  });
  await renderHeaderLot({
    lot: "Lot 102",
    title: "Lot B Vehicle",
    reserveStatus: "Has Reserve",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const lot102Immediate = await snapshotHeader();
  const lot102EarlyPhases = await page.evaluate(() =>
    Array.isArray(window.__streamHeaderPhaseLog) ? window.__streamHeaderPhaseLog.slice() : [],
  );

  await waitForHeaderSettled("Lot 102");
  const lot102Settled = await snapshotHeader();
  const lot102Phases = await page.evaluate(() =>
    Array.isArray(window.__streamHeaderPhaseLog) ? window.__streamHeaderPhaseLog.slice() : [],
  );

  await page.evaluate(() => {
    window.__streamHeaderPhaseLog = [];
  });
  await renderHeaderLot({
    lot: "Lot 103",
    title: "Lot C Vehicle",
    reserveStatus: "Offered Without Reserve",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const lot103Immediate = await snapshotHeader();
  await waitForHeaderSettled("Lot 103");
  const lot103Settled = await snapshotHeader();
  const lot103Phases = await page.evaluate(() =>
    Array.isArray(window.__streamHeaderPhaseLog) ? window.__streamHeaderPhaseLog.slice() : [],
  );

  await page.evaluate(() => {
    window.__streamHeaderPhaseLog = [];
  });
  await renderHeaderLot({
    lot: "Lot 101",
    title: "Lot A Vehicle",
    reserveStatus: "Offered Without Reserve",
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await renderHeaderLot({
    lot: "Lot 102",
    title: "Lot B Vehicle",
    reserveStatus: "Has Reserve",
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await renderHeaderLot({
    lot: "Lot 103",
    title: "Lot C Vehicle",
    reserveStatus: "Offered Without Reserve",
  });
  await waitForHeaderSettled("Lot 103");
  const rapidLot103Settled = await snapshotHeader();
  const rapidPhases = await page.evaluate(() =>
    Array.isArray(window.__streamHeaderPhaseLog) ? window.__streamHeaderPhaseLog.slice() : [],
  );

  await page.close();
  return {
    lot101Settled,
    lot101Phases,
    lot102Immediate,
    lot102EarlyPhases,
    lot102Settled,
    lot102Phases,
    lot103Immediate,
    lot103Settled,
    lot103Phases,
    rapidLot103Settled,
    rapidPhases,
  };
}

async function collectTickerSlotState(page, slotIndex) {
  return page.evaluate((index) => {
    const slotNumber = index + 1;
    const entry = document.getElementById("slot" + slotNumber);
    const lot = document.getElementById("slot" + slotNumber + "Lot");
    const title = document.getElementById("slot" + slotNumber + "Title");
    const inner = title ? title.querySelector(".inner") : null;
    const content = entry ? entry.querySelector(".lot-content") : null;
    const computed = inner ? getComputedStyle(inner).transform : "none";
    return {
      hidden: entry ? entry.classList.contains("hidden") : true,
      lotText: lot ? lot.textContent : "",
      dataTitle: title ? title.getAttribute("data-title") || "" : "",
      innerText: inner ? inner.textContent.slice(0, 120) : "",
      inlineTransform: inner ? inner.style.transform || "" : "",
      computedTransform: computed,
      isFrozen: inner ? inner.classList.contains("is-frozen") : false,
      contentFadeOut: content ? content.classList.contains("fade-out") : false,
      contentSlideIn: content ? content.classList.contains("slide-in-right") : false,
    };
  }, slotIndex);
}

export async function validateTickerMarqueeTransition(browser, tickerFixturePath) {
  const page = await browser.newPage();
  await page.setViewport({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    deviceScaleFactor: 1,
  });
  await page.goto(toFileUrl(tickerFixturePath), { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(() => typeof window.placeNextLots === "function", { timeout: 20000 });

  const longTitle = TITLE_FIXTURE_TITLES.long;
  const initialLots = [
    { lot: "102", title: longTitle },
    { lot: "103", title: "2001 Ferrari 550 Barchetta Pininfarina" },
    { lot: "104", title: "1967 Shelby GT500" },
  ];
  const shiftedLots = [
    { lot: "103", title: "2001 Ferrari 550 Barchetta Pininfarina" },
    { lot: "104", title: "1967 Shelby GT500" },
    { lot: "105", title: "1976 Cadillac Eldorado Convertible" },
  ];

  await page.evaluate((lots) => {
    window.placeNextLots(lots);
  }, initialLots);

  await page.waitForFunction(
    () => {
      const slot = document.getElementById("slot1");
      return slot && !slot.classList.contains("hidden");
    },
    { timeout: 10000 },
  );

  await new Promise((resolve) => setTimeout(resolve, 5600));
  const midScroll = await collectTickerSlotState(page, 0);
  await page.evaluate(() => {
    window.__tickerTransitionFrames = [];
  });

  await page.evaluate((lots) => {
    window.placeNextLots(lots);
    const title = document.getElementById("slot1Title");
    const inner = title ? title.querySelector(".inner") : null;
    window.__tickerTransitionFrames.push({
      phase: "immediate",
      dataTitle: title ? title.getAttribute("data-title") || "" : "",
      lotText: document.getElementById("slot1Lot")?.textContent || "",
      inlineTransform: inner ? inner.style.transform || "" : "",
      computedTransform: inner ? getComputedStyle(inner).transform : "none",
      isFrozen: inner ? inner.classList.contains("is-frozen") : false,
      contentFadeOut: document.querySelector("#slot1 .lot-content")?.classList.contains("fade-out") || false,
    });
  }, shiftedLots);

  const immediate = await collectTickerSlotState(page, 0);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const duringFade = await collectTickerSlotState(page, 0);
  await new Promise((resolve) => setTimeout(resolve, 220));
  const afterFade = await collectTickerSlotState(page, 0);
  await new Promise((resolve) => setTimeout(resolve, 320));
  const afterEntrance = await collectTickerSlotState(page, 0);

  await page.evaluate((lots) => {
    window.placeNextLots(lots);
  }, shiftedLots);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const identicalPayload = await collectTickerSlotState(page, 0);

  await page.evaluate((lots) => {
    window.placeNextLots(lots);
  }, [
    { lot: "106", title: longTitle },
    { lot: "107", title: "2001 Ferrari 550 Barchetta Pininfarina" },
    { lot: "108", title: "1967 Shelby GT500" },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 40));
  await page.evaluate((lots) => {
    window.placeNextLots(lots);
  }, [
    { lot: "107", title: "2001 Ferrari 550 Barchetta Pininfarina" },
    { lot: "108", title: "1967 Shelby GT500" },
    { lot: "109", title: "1976 Cadillac Eldorado Convertible" },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const rapidAdvance = await collectTickerSlotState(page, 0);

  const inlineFrame = await page.evaluate(
    () => (Array.isArray(window.__tickerTransitionFrames) ? window.__tickerTransitionFrames[0] : null),
  );

  await page.close();
  return {
    midScroll,
    inlineFrame,
    immediate,
    duringFade,
    afterFade,
    afterEntrance,
    identicalPayload,
    rapidAdvance,
    longTitle,
  };
}

export async function validateStreamTickerPreviewLayoutRefresh(browser, tickerFixturePath) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1, height: 1, deviceScaleFactor: 1 });
  await page.goto(toFileUrl(tickerFixturePath), { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(() => typeof window.placeNextLots === "function", { timeout: 20000 });

  const longTitle =
    "1967 Ferrari 275 GTB/4 by Scaglietti Formerly Owned by Steve McQueen with Complete Documentation and Matching Numbers Throughout";
  const lots = [
    { lot: "101", title: longTitle },
    { lot: "102", title: longTitle },
    { lot: "103", title: "Ford GT" },
  ];

  await page.evaluate((payload) => {
    window.__NEUD_VIEWER_MODE__ = "portal-preview";
    window.placeNextLots(payload);
  }, lots);

  const zeroWidthDiagnostics = await page.evaluate(() => window.__streamTickerMarqueeDiagnostics || null);

  await page.setViewport({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    if (typeof window.__neudRefreshStreamTickerLayout === "function") {
      window.__neudRefreshStreamTickerLayout("preview_expanded");
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 200));
  const expandedDiagnostics = await page.evaluate(() => window.__streamTickerMarqueeDiagnostics || null);

  await new Promise((resolve) => setTimeout(resolve, 5600));
  const scrollingDiagnostics = await page.evaluate(() => window.__streamTickerMarqueeDiagnostics || null);

  await page.close();
  return {
    zeroWidthDiagnostics,
    expandedDiagnostics,
    scrollingDiagnostics,
  };
}

export async function validateNearThresholdOverflowMarquee(browser) {
  const marqueeScript = read("desktop/src/displays/legacy-ticker-marquee.js");
  const fixtureDir = fs.mkdtempSync(path.join(outputDir, "near-threshold-"));
  const fixturePath = path.join(fixtureDir, "near-threshold-marquee.html");
  fs.writeFileSync(
    fixturePath,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  body {
    margin: 0;
    font-family: Helvetica, "Helvetica Neue", Arial, sans-serif;
    font-size: 45px;
    font-weight: 400;
  }
  .title-scroll {
    position: relative;
    overflow: hidden;
    width: 360px;
    height: 1.2em;
    white-space: nowrap;
    display: block;
  }
  .title-scroll .inner {
    display: inline-block;
    white-space: nowrap;
    transform: translate3d(0, 0, 0);
  }
</style>
<script>${marqueeScript}</script>
</head>
<body>
<span id="title" class="title-scroll" data-title=""><span class="inner"></span></span>
</body>
</html>`,
    "utf8",
  );

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(toFileUrl(fixturePath), { waitUntil: "networkidle0", timeout: 60000 });

  const result = await page.evaluate(async () => {
    var marquee = createLegacyTickerMarquee({
      speedPxPerSecond: 40,
      overflowTolerancePx: 2,
      endRevealPaddingPx: 2,
    });
    var container = document.getElementById("title");
    var inner = container.querySelector(".inner");

    function resetTitle(text) {
      container.setAttribute("data-title", text);
      inner.textContent = text;
      inner.removeAttribute("data-built");
      inner.removeAttribute("data-last-text-width");
      inner.style.transform = "translate3d(0,0,0)";
      inner.innerHTML = "";
    }

    function probe(text) {
      resetTitle(text);
      return marquee.ensureTrack(container);
    }

    function buildNearOverflowTitle(minOverflowPx) {
      var base = "Lot 102 ";
      var candidate = base;
      var track = probe(candidate);
      var guard = 0;
      while (
        Math.max(0, track.textWidth - track.viewportWidth) <= minOverflowPx &&
        guard < 500
      ) {
        candidate += "W";
        track = probe(candidate);
        guard += 1;
      }
      while (candidate.length > base.length + 1 && guard < 700) {
        var overflow = Math.max(0, track.textWidth - track.viewportWidth);
        if (overflow <= minOverflowPx + 3) {
          break;
        }
        var nextCandidate = candidate.slice(0, -1);
        var nextTrack = probe(nextCandidate);
        var nextOverflow = Math.max(0, nextTrack.textWidth - nextTrack.viewportWidth);
        if (nextOverflow <= minOverflowPx) {
          break;
        }
        candidate = nextCandidate;
        track = nextTrack;
        guard += 1;
      }
      return candidate;
    }

    var fitsTrack = probe("Ford GT");
    var nearCandidate = buildNearOverflowTitle(3);
    var nearTrack = probe(nearCandidate);
    var nearOverflowPx = Math.max(0, nearTrack.textWidth - nearTrack.viewportWidth);

    resetTitle(nearCandidate);
    var diagnostics = null;
    await new Promise(function (resolve) {
      marquee.startMarqueeStable(container, {
        slotIndex: 0,
        onDiagnostic: function (entry) {
          diagnostics = entry;
        },
      });
      setTimeout(resolve, 700);
    });

    var afterFirstLoad = diagnostics;
    resetTitle(nearCandidate);
    var secondDiagnostics = null;
    await new Promise(function (resolve) {
      marquee.startMarqueeStable(container, {
        slotIndex: 0,
        onDiagnostic: function (entry) {
          secondDiagnostics = entry;
        },
      });
      setTimeout(resolve, 700);
    });

    await new Promise(function (resolve) {
      setTimeout(resolve, 4600);
    });

    var maxDistance = 0;
    var transformSamples = [];
    for (var index = 0; index < 8; index += 1) {
      var computed = window.getComputedStyle(inner).transform;
      transformSamples.push(computed);
      var match = /matrix\(([^)]+)\)/.exec(computed);
      if (match) {
        var parts = match[1].split(",").map(function (part) {
          return parseFloat(part.trim());
        });
        if (parts.length >= 5) {
          maxDistance = Math.max(maxDistance, Math.abs(parts[4] || 0));
        }
      }
      await new Promise(function (resolve) {
        requestAnimationFrame(function () {
          setTimeout(resolve, 120);
        });
      });
    }

    return {
      nearCandidateLength: nearCandidate.length,
      fitsTrack: {
        overflowPx: fitsTrack.overflowPx,
        shouldScroll: fitsTrack.shouldScroll,
      },
      withinTolerance: {
        overflowPx: Math.max(0, fitsTrack.textWidth - fitsTrack.viewportWidth),
        shouldScroll: fitsTrack.shouldScroll,
      },
      nearTrack: {
        overflowPx: nearOverflowPx,
        shouldScroll: nearTrack.shouldScroll,
        totalTravelDistance: nearTrack.totalTravelDistance,
        easeDistance: nearTrack.easeDistance,
        cruiseDistance: nearTrack.cruiseDistance,
        textWidth: nearTrack.textWidth,
        viewportWidth: nearTrack.viewportWidth,
      },
      afterFirstLoad: afterFirstLoad,
      secondLoad: secondDiagnostics,
      maxDistance: maxDistance,
      transformSamples: transformSamples,
    };
  });

  await page.close();
  return result;
}

export async function validateDotSpacerContinuousLoop(browser, tickerFixturePath) {
  const page = await browser.newPage();
  await page.setViewport({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, deviceScaleFactor: 1 });
  await page.goto(toFileUrl(tickerFixturePath), { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(() => typeof window.placeNextLots === "function", { timeout: 20000 });

  const moderateTitle = "Lot 101 " + "W".repeat(14);
  await page.evaluate((title) => {
    window.placeNextLots([
      { lot: "101", title: title },
      { lot: "102", title: "Ford GT" },
      { lot: "103", title: title + "X" },
    ]);
  }, moderateTitle);

  await page.waitForFunction(
    () => {
      const inner = document.querySelector("#slot1Title .inner");
      return inner && inner.querySelector(".copyA");
    },
    { timeout: 15000 },
  );

  const trackStructure = await page.evaluate(() => {
    var container = document.getElementById("slot1Title");
    var inner = container ? container.querySelector(".inner") : null;
    var copyA = inner ? inner.querySelector(".copyA") : null;
    var gap = inner ? inner.querySelector(".gap") : null;
    var copyB = inner ? inner.querySelector(".copyB") : null;
    var diagnostics = window.__streamTickerMarqueeDiagnostics || null;
    var slot = diagnostics && diagnostics.slots ? diagnostics.slots[0] : null;
    return {
      hasCopyA: Boolean(copyA),
      hasGap: Boolean(gap),
      hasCopyB: Boolean(copyB),
      gapText: gap ? gap.textContent : "",
      gapAriaHidden: gap ? gap.getAttribute("aria-hidden") : null,
      copyBAriaHidden: copyB ? copyB.getAttribute("aria-hidden") : null,
      slot: slot,
      dotSpacerLoopEnabled: diagnostics ? diagnostics.dotSpacerLoopEnabled : false,
      allScrollingSlotsHaveSpacer: diagnostics ? diagnostics.allScrollingSlotsHaveSpacer : false,
      allScrollingSlotsHaveClone: diagnostics ? diagnostics.allScrollingSlotsHaveClone : false,
    };
  });

  await new Promise((resolve) => setTimeout(resolve, 35000));

  const afterLoops = await page.evaluate(() => {
    var diagnostics = window.__streamTickerMarqueeDiagnostics || null;
    var slot = diagnostics && diagnostics.slots ? diagnostics.slots[0] : null;
    return {
      slot: slot,
      activeAnimationCount: diagnostics ? diagnostics.activeAnimationCount : 0,
      dotSpacerLoopEnabled: diagnostics ? diagnostics.dotSpacerLoopEnabled : false,
    };
  });

  await page.close();
  return { trackStructure, afterLoops };
}

async function collectTickerLayoutMetrics(page) {
  return page.evaluate(() => {
    const stage = document.getElementById("stage");
    const logo = document.querySelector(".logo-panel");
    const stageRect = stage ? stage.getBoundingClientRect() : { left: 0, width: 3840 };
    const scale = stageRect.width / 3840 || 1;
    const logoRect = logo ? logo.getBoundingClientRect() : null;
    const slots = [1, 2, 3].map((slotNumber) => {
      const entry = document.getElementById("slot" + slotNumber);
      const lot = document.getElementById("slot" + slotNumber + "Lot");
      const rect = entry ? entry.getBoundingClientRect() : null;
      return {
        hidden: entry ? entry.classList.contains("hidden") : true,
        lotText: lot ? lot.textContent : "",
        left: rect ? Math.round((rect.left - stageRect.left) / scale) : null,
        width: rect ? Math.round(rect.width / scale) : null,
        right: rect ? Math.round((rect.right - stageRect.left) / scale) : null,
      };
    });
    return {
      stageLeft: Math.round(stageRect.left),
      logoLeft: logoRect ? Math.round(logoRect.left) : null,
      logoWidth: logoRect ? Math.round(logoRect.width / scale) : null,
      logoRightDesign: logoRect ? Math.round((logoRect.right - stageRect.left) / scale) : null,
      slots,
    };
  });
}

export async function validateTickerLayoutAndThreeSlots(browser, tickerFixturePath) {
  const page = await browser.newPage();
  await page.setViewport({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    deviceScaleFactor: 1,
  });
  await page.goto(toFileUrl(tickerFixturePath), { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(() => typeof window.placeNextLots === "function", { timeout: 20000 });
  await page.waitForFunction(
    () => {
      const slot3 = document.getElementById("slot3");
      return slot3 && !slot3.classList.contains("hidden");
    },
    { timeout: 10000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 700));

  const fullLayout = await collectTickerLayoutMetrics(page);

  await page.evaluate((lots) => {
    window.placeNextLots(lots);
  }, [{ lot: "201", title: "Single Upcoming Lot Only" }]);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const oneLot = await collectTickerLayoutMetrics(page);

  await page.evaluate((lots) => {
    window.placeNextLots(lots);
  }, [
    { lot: "301", title: "First of Two" },
    { lot: "302", title: "Second of Two" },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const twoLots = await collectTickerLayoutMetrics(page);

  await page.close();
  return { fullLayout, oneLot, twoLots };
}

export async function validateTitleSequence(browser, bidFixturePath) {
  const page = await browser.newPage();
  await page.setViewport({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    deviceScaleFactor: 1,
  });
  await page.goto(toFileUrl(bidFixturePath), { waitUntil: "networkidle0", timeout: 60000 });
  await waitForDisplayReady(page);

  const base = {
    ...populatedBidView,
    year: "",
    biddingPrice: "$44,000,000",
    currencies: sampleBidPayload.broadArrowDisplay.pylon.currencies,
  };
  const results = {};

  async function renderTitle(title, lot = "Lot 999") {
    await page.evaluate(
      (payload) => {
        window.render(payload);
      },
      renderFeedPayload({
        ...base,
        title,
        lot,
      }),
    );
  }

  await renderTitle(TITLE_FIXTURE_TITLES.short);
  await new Promise((resolve) => setTimeout(resolve, 700));
  results.short = await collectTitleState(page);

  await renderTitle(TITLE_FIXTURE_TITLES.medium);
  results.mediumFrames = [];
  for (let i = 0; i < 8; i += 1) {
    results.mediumFrames.push(await collectTitleState(page));
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  results.mediumSettled = await collectTitleState(page);

  await renderTitle(TITLE_FIXTURE_TITLES.exactly50);
  await new Promise((resolve) => setTimeout(resolve, 700));
  results.exactly50 = await collectTitleState(page);

  await renderTitle(TITLE_FIXTURE_TITLES.long);
  await new Promise((resolve) => setTimeout(resolve, 700));
  results.long = await collectTitleState(page);

  await renderTitle(TITLE_FIXTURE_TITLES.long);
  await new Promise((resolve) => setTimeout(resolve, 250));
  results.longRepeated = await collectTitleState(page);

  await renderTitle(TITLE_FIXTURE_TITLES.long, "Lot 998");
  await new Promise((resolve) => setTimeout(resolve, 350));
  results.longNewLot = await collectTitleState(page);

  await renderTitle("");
  await new Promise((resolve) => setTimeout(resolve, 500));
  results.empty = await collectTitleState(page);

  await page.close();
  return results;
}

export async function captureStreamDisplayScreenshots(options = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  prepareFixtureAssets();

  const bidFixturePath = path.join(outputDir, "stream-bid-fixture.html");
  const bidAnimationFixturePath = path.join(outputDir, "stream-bid-animation-fixture.html");
  const tickerFixturePath = path.join(outputDir, "stream-ticker-fixture.html");
  const tickerAlphaWrapperPath = path.join(outputDir, "stream-ticker-alpha-wrapper.html");
  const compositeWrapperPath = path.join(outputDir, "stream-composite-wrapper.html");

  fs.writeFileSync(bidFixturePath, buildBidFixtureHtml(), "utf8");
  fs.writeFileSync(bidAnimationFixturePath, buildBidAnimationFixtureHtml(), "utf8");
  fs.writeFileSync(tickerFixturePath, buildTickerFixtureHtml(), "utf8");
  fs.writeFileSync(
    tickerAlphaWrapperPath,
    buildTickerAlphaWrapperHtml("stream-ticker-fixture.html"),
    "utf8",
  );
  fs.writeFileSync(
    compositeWrapperPath,
    buildCompositeWrapperHtml("stream-bid-fixture.html", "stream-ticker-fixture.html"),
    "utf8",
  );

  const runtime = await loadValidationPuppeteer(options);
  const browser = await runtime.puppeteer.launch(runtime.launchOptions);

  const captures = [
    { name: OUTPUT_PNGS.bid, target: bidFixturePath, omitBackground: false, direct: true },
    { name: OUTPUT_PNGS.tickerAlpha, target: tickerAlphaWrapperPath, omitBackground: true, direct: false },
    { name: OUTPUT_PNGS.composite, target: compositeWrapperPath, omitBackground: false, direct: false },
  ];

  const written = {};
  let typography = null;
  let bidAnimation = null;
  let initialPopulated = null;
  let titlePresentation = null;
  let bidLotTransitions = null;
  let headerLotTransitions = null;

  try {
    for (const capture of captures) {
      const page = await browser.newPage();
      await page.setViewport({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        deviceScaleFactor: 1,
      });
      await page.goto(toFileUrl(capture.target), { waitUntil: "networkidle0", timeout: 60000 });
      await waitForDisplayReady(page);
      if (capture.name === OUTPUT_PNGS.bid) {
        typography = await collectTypographyMetrics(page);
      }
      await page.screenshot({
        path: path.join(outputDir, capture.name),
        omitBackground: capture.omitBackground,
        clip: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      });
      written[capture.name] = path.join(outputDir, capture.name);
      await page.close();
    }

    {
      const page = await browser.newPage();
      const pipAlphaPath = path.join(outputDir, OUTPUT_PNGS.pipAlpha);
      await capturePipAlphaScreenshot(page, bidFixturePath, pipAlphaPath);
      written[OUTPUT_PNGS.pipAlpha] = pipAlphaPath;
      await page.close();
    }

    bidAnimation = await validateBidAnimationSequence(browser, bidAnimationFixturePath);
    initialPopulated = await validateInitialPopulatedLoad(browser, bidFixturePath);
    titlePresentation = await validateTitleSequence(browser, bidFixturePath);
    bidLotTransitions = await validateBidLotSequence(browser, bidFixturePath);
    headerLotTransitions = await validateHeaderLotSequence(browser, bidFixturePath);
  } finally {
    await browser.close();
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    browser: {
      executablePath: runtime.executablePath,
      source: runtime.browserSource,
      puppeteerPackagePath: runtime.puppeteerPackagePath,
      puppeteerPackageVersion: runtime.puppeteerPackageVersion,
    },
    outputs: written,
    typography,
    bidAnimation,
    initialPopulated,
    titlePresentation,
    bidLotTransitions,
    headerLotTransitions,
    fixtures: {
      bid: bidFixturePath,
      bidAnimation: bidAnimationFixturePath,
    },
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  return { outputDir, written, manifest, runtime };
}

const isDirectRun = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    const result = await captureStreamDisplayScreenshots();
    console.log("Stream display validation screenshots written:");
    for (const [name, filePath] of Object.entries(result.written)) {
      console.log(`  ${name}: ${filePath}`);
    }
    console.log(`Browser: ${result.runtime.browserSource} (${result.runtime.executablePath})`);
    if (result.manifest.typography) {
      console.log(`Computed font family: ${result.manifest.typography.fontFamily}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
