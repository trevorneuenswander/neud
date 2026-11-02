#!/usr/bin/env node
/**
 * Capture 3840×2160 visual validation screenshots for SEMA Fullscreen Schedule.
 * Writes PNGs under docs/alpha-v0.3.2/screenshots/.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const outDir = path.join(repoRoot, "docs", "alpha-v0.3.2", "screenshots");

async function resolvePuppeteer() {
  const candidates = [
    path.join(repoRoot, "workers", "data-engine", "node_modules", "puppeteer"),
    path.join(repoRoot, "node_modules", "puppeteer"),
    path.join(desktopRoot, "node_modules", "puppeteer"),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // continue
    }
  }
  throw new Error("puppeteer not found — install workspace dependencies first.");
}

function loadPackagedHtml() {
  const builderPath = path.join(desktopRoot, "dist", "packages", "sema-package-builder.js");
  if (fs.existsSync(builderPath)) {
    const { loadBundledSemaScheduleFullscreenUhdHtml } = require(builderPath);
    return loadBundledSemaScheduleFullscreenUhdHtml();
  }
  // Fallback: raw source with logo injection.
  const src = path.join(
    desktopRoot,
    "src",
    "displays",
    "bundled",
    "sema-schedule-fullscreen-uhd-v1.html",
  );
  let html = fs.readFileSync(src, "utf8");
  const logo = path.join(
    desktopRoot,
    "src",
    "displays",
    "bundled",
    "assets",
    "sema-live-autozone-logo.png",
  );
  if (fs.existsSync(logo) && html.includes("__SEMA_LOGO_DATA_URI__")) {
    const dataUri = `data:image/png;base64,${fs.readFileSync(logo).toString("base64")}`;
    html = html.split("__SEMA_LOGO_DATA_URI__").join(dataUri);
  }
  return html;
}

const SCENES = [
  {
    name: "now-next-later",
    payload: {
      source: "google-sheets",
      stale: false,
      schedule: {
        now: {
          date: "2026-11-02",
          time: "10:00",
          title: "Opening Keynote — Live Broadcast Confidence Monitor",
          description: "Main Stage · Hall A",
        },
        next: {
          date: "2026-11-02",
          time: "11:00",
          title: "Industry Panel: Future of Performance",
          description: "Hall B",
        },
        later: {
          date: "2026-11-02",
          time: "12:00",
          title: "Lunch & Networking",
          description: "Atrium",
        },
        highlightActive: false,
        currentRowId: "sel-1",
        source: "google-sheets",
        stale: false,
      },
    },
  },
  {
    name: "highlight-active",
    payload: {
      source: "google-sheets",
      stale: false,
      schedule: {
        now: {
          date: "2026-11-02",
          time: "14:00",
          title: "Track Session",
          description: "Pavilion 3",
        },
        next: {
          date: "2026-11-02",
          time: "15:00",
          title: "Press Conference",
          description: "Media Center",
        },
        later: {
          date: "",
          time: "",
          title: "VIP Lounge Spotlight",
          description: "Invite only · Level 2",
        },
        highlightActive: true,
        currentRowId: "sel-4",
        source: "google-sheets",
        stale: false,
      },
    },
  },
  {
    name: "empty-next-later",
    payload: {
      source: "manual",
      stale: false,
      schedule: {
        now: {
          date: "2026-11-02",
          time: "16:30",
          title: "Closing Remarks",
          description: "Main Stage",
        },
        next: null,
        later: null,
        highlightActive: false,
        currentRowId: "sel-9",
        source: "manual",
        stale: false,
      },
    },
  },
  {
    name: "stale-offline",
    payload: {
      source: "google-sheets",
      stale: true,
      offline: true,
      schedule: {
        now: {
          date: "2026-11-02",
          time: "09:15",
          title: "Cached Morning Session",
          description: "Last known good state",
        },
        next: {
          date: "2026-11-02",
          time: "10:00",
          title: "Cached Next Item",
          description: "Hall C",
        },
        later: null,
        highlightActive: false,
        currentRowId: "sel-0",
        source: "google-sheets",
        stale: true,
      },
    },
  },
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const puppeteer = await resolvePuppeteer();
  const html = loadPackagedHtml();
  const tmpHtml = path.join(outDir, "_preview-fullscreen-uhd.html");
  fs.writeFileSync(tmpHtml, html, "utf8");

  // Prefer system Chrome — bundled "Chrome for Testing" frameworks are often incomplete in CI/dev caches.
  const executableCandidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    path.join(
      desktopRoot,
      "staging",
      "puppeteer",
      "chrome",
      "chrome-mac-arm64",
      "Google Chrome for Testing.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing",
    ),
  ];
  const executablePath = executableCandidates.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) {
    throw new Error("No Chrome/Chromium executable found for screenshot capture.");
  }
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });

  const paths = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 3840, height: 2160, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "networkidle0" });

    for (const scene of SCENES) {
      await page.evaluate((payload) => {
        if (window.__SEMA_SCHEDULE_FULLSCREEN_UHD__?.render) {
          window.__SEMA_SCHEDULE_FULLSCREEN_UHD__.render(payload);
        }
      }, scene.payload);
      // Allow crossfade / layout / marquee first frame.
      await new Promise((resolve) => setTimeout(resolve, 350));
      const outPath = path.join(outDir, `sema-fullscreen-uhd-${scene.name}.png`);
      await page.screenshot({ path: outPath, type: "png", fullPage: false });
      paths.push(outPath);
      console.log(`wrote ${outPath}`);
    }

    // Overflow / clipping probe on long title scene.
    const metrics = await page.evaluate(() => {
      const stage = document.getElementById("stage");
      const nowTitle = document.querySelector('[data-group="now"] [data-field="title"] .field-text');
      return {
        stageScroll: Boolean(stage && (stage.scrollWidth > stage.clientWidth || stage.scrollHeight > stage.clientHeight)),
        bodyScroll: document.documentElement.scrollWidth > 3840 || document.documentElement.scrollHeight > 2160,
        nowTitleOverflow:
          nowTitle && nowTitle.parentElement
            ? nowTitle.scrollWidth > nowTitle.parentElement.parentElement.clientWidth + 2
            : null,
      };
    });
    fs.writeFileSync(
      path.join(outDir, "sema-fullscreen-uhd-metrics.json"),
      `${JSON.stringify({ metrics, scenes: paths }, null, 2)}\n`,
      "utf8",
    );
    console.log(JSON.stringify({ ok: true, metrics, count: paths.length }, null, 2));
  } finally {
    await browser.close();
    fs.rmSync(tmpHtml, { force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
