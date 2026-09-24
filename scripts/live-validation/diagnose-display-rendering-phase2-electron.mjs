#!/usr/bin/env node
/**
 * Phase 2: live Electron + enabled Stream Ticker diagnostics (no product fixes).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);
const puppeteer = require("../../workers/data-engine/node_modules/puppeteer");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const origin = process.env.NEUD_DIAG_ORIGIN?.trim() || "http://127.0.0.1:3000";
const localApiOrigin = process.env.NEUD_LOCAL_API_ORIGIN?.trim() || "http://127.0.0.1:8070";
const cdpUrl = process.env.NEUD_ELECTRON_CDP?.trim() || "http://127.0.0.1:9333";
const jsonlPath = path.join(
  os.homedir(),
  "AppData",
  "Roaming",
  "NEUD",
  "preview-window-runtime-diagnostic.jsonl",
);
const outputPath = path.join(repoRoot, "docs", "display-rendering-phase2-diagnostic.json");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function waitForUrl(url, timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { parseError: true, line };
      }
    });
}

async function layerAudit(page, samplePoint, selectors = []) {
  return page.evaluate(
    (point, extraSelectors) => {
      function layer(el) {
        if (!(el instanceof Element)) return null;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          className: typeof el.className === "string" ? el.className : null,
          dataset: { ...el.dataset },
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          backgroundColor: style.backgroundColor,
          opacity: style.opacity,
          zIndex: style.zIndex,
          position: style.position,
          transform: style.transform,
          filter: style.filter,
          isolation: style.isolation,
          contain: style.contain,
        };
      }
      const stack = document.elementsFromPoint(point.x, point.y).slice(0, 14).map((el) => ({
        tag: el.tagName.toLowerCase(),
        className: typeof el.className === "string" ? el.className : null,
        backgroundColor: getComputedStyle(el).backgroundColor,
      }));
      const picked = {};
      for (const sel of extraSelectors) {
        picked[sel] = layer(document.querySelector(sel));
      }
      return {
        samplePoint: point,
        stack,
        html: layer(document.documentElement),
        body: layer(document.body),
        ...picked,
      };
    },
    samplePoint,
    selectors,
  );
}

async function probeDisplayDocument(browser, label, url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const navigation = { label, url, finalUrl: null, title: null, displayOff: null };
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 90_000 });
    navigation.finalUrl = page.url();
    navigation.title = await page.title();
    navigation.displayOff =
      navigation.title === "Display Off" ||
      (await page.evaluate(() => document.body?.innerText?.includes("Display Off") ?? false));
    const point = { x: 960, y: 400 };
    const outer = await layerAudit(page, point);
    let inner = null;
    const iframe = await page.$("iframe");
    if (iframe) {
      const frame = await iframe.contentFrame();
      if (frame) {
        inner = await frame.evaluate((pt) => {
          function layer(el) {
            if (!(el instanceof Element)) return null;
            const style = getComputedStyle(el);
            return {
              tag: el.tagName.toLowerCase(),
              className: typeof el.className === "string" ? el.className : null,
              backgroundColor: style.backgroundColor,
            };
          }
          const stack = document.elementsFromPoint(pt.x, pt.y).slice(0, 12).map((el) => ({
            tag: el.tagName.toLowerCase(),
            className: typeof el.className === "string" ? el.className : null,
            backgroundColor: getComputedStyle(el).backgroundColor,
          }));
          return {
            title: document.title,
            locationHref: location.href,
            stack,
            html: layer(document.documentElement),
            body: layer(document.body),
            viewport: layer(document.querySelector(".viewport")),
            displayStage: layer(document.querySelector(".display-stage")),
            displayOffText: document.body?.innerText?.includes("Display Off") ?? false,
          };
        }, point);
      }
    } else {
      inner = await page.evaluate((pt) => {
        const stack = document.elementsFromPoint(pt.x, pt.y).slice(0, 12).map((el) => ({
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === "string" ? el.className : null,
          backgroundColor: getComputedStyle(el).backgroundColor,
        }));
        return {
          title: document.title,
          locationHref: location.href,
          stack,
          displayOffText: document.body?.innerText?.includes("Display Off") ?? false,
        };
      }, point);
    }
    return { navigation, outer, inner };
  } finally {
    await page.close();
  }
}

function firstOpaqueFromStack(stack) {
  for (const entry of stack ?? []) {
    const bg = entry.backgroundColor || "";
    if (
      bg &&
      bg !== "rgba(0, 0, 0, 0)" &&
      bg !== "transparent" &&
      !bg.includes("0, 0, 0, 0)")
    ) {
      return entry;
    }
  }
  return null;
}

function compareStacks(a, b) {
  const max = Math.max(a?.length ?? 0, b?.length ?? 0);
  for (let i = 0; i < max; i += 1) {
    const left = a?.[i];
    const right = b?.[i];
    if ((left?.tag ?? null) !== (right?.tag ?? null)) {
      return { index: i, reason: "tag", pinned: left ?? null, local: right ?? null };
    }
    if ((left?.backgroundColor ?? null) !== (right?.backgroundColor ?? null)) {
      return { index: i, reason: "backgroundColor", pinned: left ?? null, local: right ?? null };
    }
  }
  return null;
}

async function flagComparison(browser, origin, dataUrl) {
  const base = `${origin}/displays/new-ticker-v1?${new URLSearchParams({ src: dataUrl, poll: "1000" }).toString()}`;
  const variants = {
    none: base,
    preview: `${base}&preview=1`,
    pinnedPreview: `${base}&preview=1&pinnedPreview=1`,
    pinnedPreviewSample: `${base}&preview=1&pinnedPreview=1&previewSample=1`,
  };
  const point = { x: 960, y: 400 };
  const results = {};
  let firstChange = null;
  let baselineStack = null;
  for (const [key, url] of Object.entries(variants)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 90_000 });
    await new Promise((r) => setTimeout(r, 1500));
    const sample = await page.evaluate((pt) => {
      const stack = document.elementsFromPoint(pt.x, pt.y).slice(0, 8).map((el) => ({
        tag: el.tagName.toLowerCase(),
        className: typeof el.className === "string" ? el.className : null,
        backgroundColor: getComputedStyle(el).backgroundColor,
      }));
      return {
        title: document.title,
        displayOffText: document.body?.innerText?.includes("Display Off") ?? false,
        stack,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        viewportBg: document.querySelector(".viewport")
          ? getComputedStyle(document.querySelector(".viewport")).backgroundColor
          : null,
        stageBg: document.querySelector(".display-stage")
          ? getComputedStyle(document.querySelector(".display-stage")).backgroundColor
          : null,
      };
    }, point);
    results[key] = { url, sample };
    if (!baselineStack) baselineStack = sample.stack;
    else if (!firstChange) {
      const diff = compareStacks(baselineStack, sample.stack);
      if (diff) firstChange = { versus: "none", variant: key, diff };
    }
    await page.close();
  }
  return { results, firstFlagCombinationChange: firstChange };
}

async function auditPinnedDomViaCdp() {
  try {
    const browser = await puppeteer.connect({ browserURL: cdpUrl, defaultViewport: null });
    const pages = await browser.pages();
    const main = pages.find((p) => p.url().includes("127.0.0.1:3000")) ?? pages[0];
    if (!main) {
      return { connected: true, error: "no_pages" };
    }
    await main.bringToFront();
    const pinnedRegion = await main.$('[data-pinned-preview-region=""]');
    if (!pinnedRegion) {
      return {
        connected: true,
        mainUrl: main.url(),
        error: "pinned_region_not_found",
        hint: "Navigate to a project with Stream Ticker pinned",
      };
    }
    const box = await pinnedRegion.boundingBox();
    const point = box
      ? { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + Math.min(80, box.height * 0.25)) }
      : { x: 400, y: 200 };
    const outer = await main.evaluate((pt) => {
      function layer(el) {
        if (!(el instanceof Element)) return null;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === "string" ? el.className : null,
          dataset: { ...el.dataset },
          backgroundColor: style.backgroundColor,
          opacity: style.opacity,
          zIndex: style.zIndex,
          transform: style.transform,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }
      const stack = document.elementsFromPoint(pt.x, pt.y).slice(0, 14).map((el) => ({
        tag: el.tagName.toLowerCase(),
        className: typeof el.className === "string" ? el.className : null,
        backgroundColor: getComputedStyle(el).backgroundColor,
      }));
      return {
        point: pt,
        stack,
        pinnedRegion: layer(document.querySelector('[data-pinned-preview-region=""]')),
        pinnedWrapper: layer(document.querySelector('[data-pinned-preview-wrapper=""]')),
        iframe: layer(document.querySelector('[data-pinned-preview-region=""] iframe')),
      };
    }, point);

    let inner = null;
    const iframeHandle = await main.$('[data-pinned-preview-region=""] iframe');
    if (iframeHandle) {
      const frame = await iframeHandle.contentFrame();
      if (frame) {
        inner = await frame.evaluate((pt) => {
          const stack = document.elementsFromPoint(pt.x, pt.y).slice(0, 12).map((el) => ({
            tag: el.tagName.toLowerCase(),
            className: typeof el.className === "string" ? el.className : null,
            backgroundColor: getComputedStyle(el).backgroundColor,
          }));
          return {
            href: location.href,
            title: document.title,
            displayOffText: document.body?.innerText?.includes("Display Off") ?? false,
            stack,
            body: getComputedStyle(document.body).backgroundColor,
            viewport: document.querySelector(".viewport")
              ? getComputedStyle(document.querySelector(".viewport")).backgroundColor
              : null,
            stage: document.querySelector(".display-stage")
              ? getComputedStyle(document.querySelector(".display-stage")).backgroundColor
              : null,
          };
        }, { x: Math.min(point.x, 400), y: Math.min(point.y, 200) });
      }
    }
    await browser.disconnect();
    return { connected: true, mainUrl: main.url(), point, outer, inner };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function openFullscreenViaCdp(projectId, displayId) {
  try {
    const browser = await puppeteer.connect({ browserURL: cdpUrl, defaultViewport: null });
    const pages = await browser.pages();
    const main = pages.find((p) => p.url().includes("127.0.0.1:3000")) ?? pages[0];
    if (!main) return { ok: false, error: "no_main_page" };
    const dataUrl = `${origin}/api/displays/new-ticker-v1/data`;
    const viewerUrl = `${origin}/displays/new-ticker-v1?${new URLSearchParams({ src: dataUrl, poll: "1000" }).toString()}`;
    const result = await main.evaluate(
      async (payload) => {
        const api = window.neudDesktop?.displays;
        if (!api?.openPreview) {
          return { ok: false, error: "openPreview_unavailable" };
        }
        try {
          await api.openPreview(payload);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      {
        projectId,
        displayId,
        title: "Stream Ticker v1",
        viewerUrl,
        displayWidth: 1920,
        displayHeight: 1080,
      },
    );
    await browser.disconnect();
    return { ok: result.ok, viewerUrl, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function readRuntimeHashes() {
  const pairs = [
    ["desktop/src/services/display-preview-window-manager.ts", "desktop/dist/services/display-preview-window-manager.js"],
    ["src/app/display/window-fit/page.tsx", null],
    ["src/components/displays/DisplayWindowFitClient.tsx", null],
    ["src/components/displays/PinnedDisplayLiveSlot.tsx", null],
    ["src/components/displays/DisplayCanvasPreview.tsx", null],
  ];
  return pairs.map(([srcRel, distRel]) => ({
    src: srcRel,
    dist: distRel,
    srcSha256: fs.existsSync(path.join(repoRoot, srcRel)) ? sha256File(path.join(repoRoot, srcRel)) : null,
    distSha256:
      distRel && fs.existsSync(path.join(repoRoot, distRel))
        ? sha256File(path.join(repoRoot, distRel))
        : null,
  }));
}

async function main() {
  const report = {
    capturedAt: new Date().toISOString(),
    electronRan: false,
    streamTickerEnabled: null,
    displayOffOverlayPresent: null,
    connectionOverlayPresent: null,
  };

  await waitForUrl(`${origin}/api/health`);

  let enabledViaNext = null;
  try {
    const r = await fetch(`${origin}/api/displays/new-ticker-v1/enabled`, { cache: "no-store" });
    enabledViaNext = (await r.json()).enabled === true;
  } catch {
    enabledViaNext = false;
  }
  let enabledViaLocal = null;
  try {
    const r = await fetch(`${localApiOrigin}/api/displays/new-ticker-v1/enabled`, {
      cache: "no-store",
    });
    enabledViaLocal = (await r.json()).enabled === true;
  } catch {
    enabledViaLocal = null;
  }
  report.streamTickerEnabled = enabledViaNext || enabledViaLocal === true;
  report.enabledProbe = { viaNext: enabledViaNext, viaLocalApi: enabledViaLocal };

  let electronOk = false;
  try {
    await waitForUrl(`${cdpUrl}/json/version`, 120_000);
    electronOk = true;
  } catch {
    electronOk = false;
  }
  report.electronRan = electronOk;

  const dataUrl = `${origin}/api/displays/new-ticker-v1/data`;
  const localUrl = `${origin}/displays/new-ticker-v1?${new URLSearchParams({ src: dataUrl, poll: "1000" }).toString()}`;
  const previewUrl = `${localUrl}&preview=1`;
  const pinnedUrl = `${localUrl}&preview=1&pinnedPreview=1&previewSample=1`;
  const windowFitUrl = `${origin}/display/window-fit?${new URLSearchParams({
    target: localUrl,
    width: "1920",
    height: "1080",
  }).toString()}`;

  const browser = await puppeteer.launch({ headless: true, args: ["--disable-web-security"] });

  const localProbe = await probeDisplayDocument(browser, "local", localUrl);
  const pinnedDocProbe = await probeDisplayDocument(browser, "pinned-doc", pinnedUrl);
  const previewProbe = await probeDisplayDocument(browser, "preview", previewUrl);
  const windowFitProbe = await probeDisplayDocument(browser, "window-fit", windowFitUrl);

  report.displayOffOverlayPresent =
    localProbe.navigation.displayOff ||
    localProbe.inner?.displayOffText ||
    localProbe.inner?.title === "Display Off";
  report.connectionOverlayPresent = localProbe.inner?.displayOffText === true;

  const flagAudit = await flagComparison(browser, origin, dataUrl);

  await browser.close();

  const wasmPath = path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const dbPath = path.join(os.homedir(), "AppData", "Roaming", "NEUD", "data", "neud.sqlite");
  let projectId = null;
  let displayId = null;
  if (fs.existsSync(dbPath)) {
    const db = new SQL.Database(fs.readFileSync(dbPath));
    projectId =
      db.exec(`SELECT id FROM projects ORDER BY updated_at DESC LIMIT 1`)[0]?.values?.[0]?.[0] ??
      null;
    displayId =
      db.exec(
        `SELECT id FROM displays WHERE display_key = 'new-ticker-v1' ORDER BY updated_at DESC LIMIT 1`,
      )[0]?.values?.[0]?.[0] ?? "new-ticker-v1";
    db.close();
  }

  let openPreviewResult = { skipped: !electronOk };
  if (electronOk && projectId) {
    openPreviewResult = await openFullscreenViaCdp(String(projectId), String(displayId));
    await new Promise((r) => setTimeout(r, 4000));
    if (openPreviewResult.ok) {
      openPreviewResult.secondOpen = await openFullscreenViaCdp(String(projectId), String(displayId));
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const pinnedCdp = electronOk ? await auditPinnedDomViaCdp() : { skipped: true };
  const jsonlEntries = readJsonl(jsonlPath);

  const fullscreenScreenshot = path.join(repoRoot, "docs", "display-rendering-phase2-fullscreen.png");
  if (electronOk && fs.existsSync(jsonlPath)) {
    try {
      const b = await puppeteer.connect({ browserURL: cdpUrl, defaultViewport: null });
      const pages = await b.pages();
      const viewer =
        pages.find((p) => p.url().includes("/display/window-fit")) ??
        pages.find((p) => p.title().includes("Ticker") || p.title().includes("Stream"));
      if (viewer) {
        await viewer.screenshot({ path: fullscreenScreenshot });
        report.fullscreenScreenshot = fullscreenScreenshot;
      }
      await b.disconnect();
    } catch {
      // optional
    }
  }

  const pinnedInnerStack = pinnedCdp.inner?.stack ?? pinnedDocProbe.inner?.stack;
  const localInnerStack = localProbe.inner?.stack;
  const firstPinnedOpaqueEnabled = firstOpaqueFromStack(pinnedInnerStack);
  const divergence = compareStacks(pinnedInnerStack, localInnerStack);

  const insidePoint = { x: 960, y: 400 };
  const letterboxPoint = { x: 20, y: 20 };
  let letterboxAudit = null;
  if (electronOk) {
    try {
      const b = await puppeteer.connect({ browserURL: cdpUrl, defaultViewport: null });
      const viewer = (await b.pages()).find((p) => p.url().includes("/display/window-fit"));
      if (viewer) {
        letterboxAudit = await viewer.evaluate((points) => {
          function topStack(pt) {
            return document.elementsFromPoint(pt.x, pt.y).slice(0, 10).map((el) => ({
              tag: el.tagName.toLowerCase(),
              className: typeof el.className === "string" ? el.className : null,
              backgroundColor: getComputedStyle(el).backgroundColor,
            }));
          }
          return {
            inside: topStack(points.inside),
            letterbox: topStack(points.letterbox),
          };
        }, { inside: insidePoint, letterbox: letterboxPoint });
      }
      await b.disconnect();
    } catch {
      letterboxAudit = null;
    }
  }

  const createEntries = jsonlEntries.filter((e) => e.label === "create-options");
  const focusEntries = jsonlEntries.filter((e) => e.label === "focus-existing");
  const resizeEvents = jsonlEntries.filter((e) =>
    String(e.label ?? "").startsWith("window-") || String(e.label ?? "").includes("resize"),
  );
  const finishLoad = jsonlEntries.filter((e) => e.label === "did-finish-load").at(-1);

  report.surfaces = {
    preview: previewProbe,
    pinnedDoc: pinnedDocProbe,
    local: localProbe,
    windowFit: windowFitProbe,
    urls: { previewUrl, pinnedUrl, localUrl, windowFitUrl },
  };
  report.flagAudit = flagAudit;
  report.pinnedCdp = pinnedCdp;
  report.openPreview = openPreviewResult;
  report.jsonl = { path: jsonlPath, entryCount: jsonlEntries.length, entries: jsonlEntries };
  report.analysis = {
    firstPinnedOpaqueLayerEnabled: firstPinnedOpaqueEnabled,
    firstPinnedVsLocalTransparencyDivergence: divergence,
    fullscreenInsideGraphicBackground: letterboxAudit?.inside ?? windowFitProbe.inner?.stack,
    fullscreenLetterboxBackground: letterboxAudit?.letterbox ?? windowFitProbe.outer?.stack,
    fullscreenWebContentsUrl: finishLoad?.webContentsUrl ?? null,
    decodedFullscreenTarget: localUrl,
    resizeEventsCaptured: resizeEvents.length > 0,
    resizeEvents,
    boundsBeforeAfter: jsonlEntries.filter((e) => e.label?.includes("programmatic-resize")),
    freshVsReused: {
      createCount: createEntries.length,
      focusExistingCount: focusEntries.length,
      secondOpen: openPreviewResult.secondOpen ?? null,
    },
    browserWindowStateAfterLoad: finishLoad ?? null,
    runtimeSourceHashes: await readRuntimeHashes(),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
  console.log(
    JSON.stringify(
      {
        electronRan: report.electronRan,
        streamTickerEnabled: report.streamTickerEnabled,
        displayOff: report.displayOffOverlayPresent,
        firstPinnedOpaque: firstPinnedOpaqueEnabled,
        divergence,
        jsonlEntries: jsonlEntries.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
