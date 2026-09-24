#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("../../workers/data-engine/node_modules/puppeteer");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const origin = process.env.NEUD_DIAG_ORIGIN?.trim() || "http://127.0.0.1:3000";
const cdpUrl = process.env.NEUD_ELECTRON_CDP?.trim() || "http://127.0.0.1:9333";
const jsonlPath = path.join(os.homedir(), "AppData", "Roaming", "NEUD", "preview-window-runtime-diagnostic.jsonl");
const outputPath = path.join(repoRoot, "docs", "display-rendering-phase2-diagnostic.json");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function firstOpaque(stack) {
  for (const entry of stack ?? []) {
    const bg = entry.backgroundColor || "";
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && !bg.includes("0, 0, 0, 0")) {
      return entry;
    }
  }
  return null;
}

function stackDiff(a, b) {
  const max = Math.max(a?.length ?? 0, b?.length ?? 0);
  for (let i = 0; i < max; i += 1) {
    const left = a?.[i];
    const right = b?.[i];
    if ((left?.tag ?? null) !== (right?.tag ?? null) || (left?.backgroundColor ?? null) !== (right?.backgroundColor ?? null)) {
      return { index: i, local: right ?? null, pinned: left ?? null };
    }
  }
  return null;
}

async function innerStackAt(page, point) {
  return page.evaluate((pt) => {
    const stack = document.elementsFromPoint(pt.x, pt.y).slice(0, 12).map((el) => ({
      tag: el.tagName.toLowerCase(),
      className: typeof el.className === "string" ? el.className : null,
      backgroundColor: getComputedStyle(el).backgroundColor,
    }));
    return {
      title: document.title,
      href: location.href,
      displayOff: document.body?.innerText?.includes("Display Off") ?? false,
      stack,
      body: getComputedStyle(document.body).backgroundColor,
      viewport: document.querySelector(".viewport")
        ? getComputedStyle(document.querySelector(".viewport")).backgroundColor
        : null,
      stage: document.querySelector(".display-stage")
        ? getComputedStyle(document.querySelector(".display-stage")).backgroundColor
        : null,
    };
  }, point);
}

async function probeUrl(browser, url, point = { x: 960, y: 400 }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 120_000 });
  await new Promise((r) => setTimeout(r, 2000));
  const sample = await innerStackAt(page, point);
  await page.close();
  return { url, sample };
}

async function main() {
  const report = { capturedAt: new Date().toISOString() };

  let electronOk = false;
  try {
    await fetch(`${cdpUrl}/json/version`);
    electronOk = true;
  } catch {
    electronOk = false;
  }
  report.electronRan = electronOk;

  const electronBrowser = electronOk
    ? await puppeteer.connect({ browserURL: cdpUrl, defaultViewport: null })
    : null;
  const mainPage = electronBrowser
    ? (await electronBrowser.pages()).find((p) => p.url().includes("/displays"))
    : null;

  const liveDiscovery = mainPage
    ? await mainPage.evaluate(() => {
        const pinnedIframes = [...document.querySelectorAll('[data-pinned-preview-region] iframe')].map(
          (f) => ({ title: f.title, src: f.src }),
        );
        const stream = pinnedIframes.find((f) => /stream-ticker/i.test(f.src) || /Stream Ticker/i.test(f.title));
        return {
          pageUrl: location.href,
          streamTickerSwitch: [...document.querySelectorAll('[role="switch"]')].find((s) =>
            (s.getAttribute("aria-label") ?? "").startsWith("Stream Ticker display enabled"),
          )?.getAttribute("aria-checked") ?? null,
          pinnedIframes,
          streamTickerPinnedSrc: stream?.src ?? null,
        };
      })
    : null;

  const pinnedUrl = liveDiscovery?.streamTickerPinnedSrc;
  const localUrl = pinnedUrl
    ? pinnedUrl.replace(/([?&])preview=1&?/, "$1").replace(/([?&])pinnedPreview=1&?/, "$1").replace(/([?&])previewSample=1&?/, "$1").replace(/[?&]$/, "").replace(/\?$/, "")
    : null;
  const previewUrl = localUrl ? `${localUrl}${localUrl.includes("?") ? "&" : "?"}preview=1` : null;
  const windowFitUrl =
    localUrl &&
    `${origin}/display/window-fit?${new URLSearchParams({ target: localUrl, width: "3840", height: "2160" }).toString()}`;

  report.liveDiscovery = liveDiscovery;
  report.runtimeUrls = { previewUrl, pinnedUrl, localUrl, windowFitUrl };

  report.streamTickerEnabled = liveDiscovery?.streamTickerSwitch === "true";
  report.displayEnabled = report.streamTickerEnabled;

  const headless = await puppeteer.launch({ headless: true, args: ["--disable-web-security"] });

  const flagVariants = localUrl
    ? {
        none: localUrl,
        preview: `${localUrl}${localUrl.includes("?") ? "&" : "?"}preview=1`,
        pinnedPreview: `${localUrl}${localUrl.includes("?") ? "&" : "?"}preview=1&pinnedPreview=1`,
        pinnedPreviewSample: `${localUrl}${localUrl.includes("?") ? "&" : "?"}preview=1&pinnedPreview=1&previewSample=1`,
      }
    : {};
  const flagResults = {};
  let flagFirstChange = null;
  let baseline = null;
  for (const [key, url] of Object.entries(flagVariants)) {
    flagResults[key] = await probeUrl(headless, url);
    if (!baseline) baseline = flagResults[key].sample.stack;
    else if (!flagFirstChange) {
      const d = stackDiff(flagResults[key].sample.stack, baseline);
      if (d) flagFirstChange = { variant: key, diff: d };
    }
  }

  const localProbe = localUrl ? await probeUrl(headless, localUrl) : null;
  const pinnedProbe = pinnedUrl ? await probeUrl(headless, pinnedUrl) : null;
  const previewProbe = previewUrl ? await probeUrl(headless, previewUrl) : null;

  report.displayOffOverlayPresent =
    localProbe?.sample.displayOff ||
    pinnedProbe?.sample.displayOff ||
    /Display Off/i.test(localProbe?.sample.title ?? "");
  report.connectionOverlayPresent = report.displayOffOverlayPresent;

  let pinnedCdp = null;
  if (mainPage && pinnedUrl) {
    const box = await mainPage.$eval('[data-pinned-preview-region=""]', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }).catch(() => null);
    const point = box
      ? { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + Math.min(100, box.height * 0.3)) }
      : { x: 400, y: 200 };
    const outer = await mainPage.evaluate((pt) => {
      const stack = document.elementsFromPoint(pt.x, pt.y).slice(0, 14).map((el) => ({
        tag: el.tagName.toLowerCase(),
        className: typeof el.className === "string" ? el.className : null,
        dataset: { ...el.dataset },
        backgroundColor: getComputedStyle(el).backgroundColor,
      }));
      return { point: pt, stack };
    }, point);
    const iframe = await mainPage.$('[data-pinned-preview-region=""] iframe[title="Stream Ticker preview"]');
    let inner = null;
    if (iframe) {
      const frame = await iframe.contentFrame();
      if (frame) {
        inner = await frame.evaluate(() => {
          const pt = { x: 400, y: 120 };
          const stack = document.elementsFromPoint(pt.x, pt.y).slice(0, 12).map((el) => ({
            tag: el.tagName.toLowerCase(),
            className: typeof el.className === "string" ? el.className : null,
            backgroundColor: getComputedStyle(el).backgroundColor,
          }));
          return {
            href: location.href,
            displayOff: document.body?.innerText?.includes("Display Off") ?? false,
            stack,
            body: getComputedStyle(document.body).backgroundColor,
            viewport: document.querySelector(".viewport")
              ? getComputedStyle(document.querySelector(".viewport")).backgroundColor
              : null,
            stage: document.querySelector(".display-stage")
              ? getComputedStyle(document.querySelector(".display-stage")).backgroundColor
              : null,
          };
        });
      }
    }
    pinnedCdp = { point, outer, inner };
  }

  if (mainPage) {
    await mainPage.evaluate(() => {
      const buttons = [...document.querySelectorAll("button")];
      const fullscreen = buttons.find((b) => b.textContent?.trim() === "View Fullscreen");
      const streamCard = buttons
        .filter((b) => b.textContent?.trim() === "View Fullscreen")[0];
      streamCard?.click();
    });
    await new Promise((r) => setTimeout(r, 5000));
  }

  const jsonlEntries = readJsonl(jsonlPath);
  const finishLoad = jsonlEntries.filter((e) => e.label === "did-finish-load").at(-1);
  const createCount = jsonlEntries.filter((e) => e.label === "create-options").length;
  const focusCount = jsonlEntries.filter((e) => e.label === "focus-existing").length;

  let fullscreenLetterbox = null;
  let fullscreenInside = null;
  if (electronBrowser) {
    const viewer = (await electronBrowser.pages()).find((p) => p.url().includes("/display/window-fit"));
    if (viewer) {
      fullscreenInside = await viewer.evaluate(() => {
        const pt = { x: Math.floor(window.innerWidth / 2), y: Math.floor(window.innerHeight / 2) };
        return document.elementsFromPoint(pt.x, pt.y).slice(0, 10).map((el) => ({
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === "string" ? el.className : null,
          backgroundColor: getComputedStyle(el).backgroundColor,
        }));
      });
      fullscreenLetterbox = await viewer.evaluate(() => {
        const pt = { x: 8, y: 8 };
        return document.elementsFromPoint(pt.x, pt.y).slice(0, 10).map((el) => ({
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === "string" ? el.className : null,
          backgroundColor: getComputedStyle(el).backgroundColor,
        }));
      });
      await viewer.screenshot({
        path: path.join(repoRoot, "docs", "display-rendering-phase2-fullscreen.png"),
      });
    }
    if (mainPage) {
      await mainPage.evaluate(() => {
        const buttons = [...document.querySelectorAll("button")];
        buttons.filter((b) => b.textContent?.trim() === "View Fullscreen")[0]?.click();
      });
      await new Promise((r) => setTimeout(r, 1500));
    }
    await electronBrowser.disconnect();
  }

  await headless.close();

  const divergence = stackDiff(pinnedProbe?.sample.stack, localProbe?.sample.stack);
  const firstPinnedOpaque =
    firstOpaque(pinnedCdp?.inner?.stack) ?? firstOpaque(pinnedProbe?.sample.stack);

  const distPath = path.join(repoRoot, "desktop", "dist", "services", "display-preview-window-manager.js");
  const srcPath = path.join(repoRoot, "desktop", "src", "services", "display-preview-window-manager.ts");

  report.probes = { localProbe, pinnedProbe, previewProbe, flagResults, pinnedCdp };
  report.jsonl = { path: jsonlPath, entries: jsonlEntries };
  report.analysis = {
    firstPinnedOpaqueLayerEnabled: firstPinnedOpaque,
    firstPinnedVsLocalTransparencyDivergence: divergence,
    flagFirstChange,
    fullscreenWebContentsUrl: finishLoad?.webContentsUrl ?? null,
    decodedFullscreenTarget: finishLoad?.loadUrl ? null : localUrl,
    fullscreenInsideGraphicBackground: fullscreenInside,
    fullscreenLetterboxBackground: fullscreenLetterbox,
    resizeEvents: jsonlEntries.filter((e) => String(e.label).includes("resize")),
    browserWindowStateAfterLoad: finishLoad,
    freshVsReused: { createCount, focusCount },
    runtimeCodeMatchesSource:
      fs.existsSync(distPath) &&
      fs.existsSync(srcPath) &&
      /resizable:\s*true/.test(fs.readFileSync(srcPath, "utf8")) ===
        /resizable:\s*true/.test(fs.readFileSync(distPath, "utf8")),
    distSha256: fs.existsSync(distPath) ? sha256File(distPath) : null,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
