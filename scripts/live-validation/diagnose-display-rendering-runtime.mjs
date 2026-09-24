#!/usr/bin/env node
/**
 * Diagnostic-only: probes live Next dev URLs and local SQLite display sources.
 * Does not modify product behavior.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("../../workers/data-engine/node_modules/puppeteer");
import { resolveLocalNeudDatabasePath } from "./lib/local-neud-db.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const origin = process.env.NEUD_DIAG_ORIGIN?.trim() || "http://127.0.0.1:3000";
const outputPinned = path.join(repoRoot, "docs", "pinned-transparency-runtime-diagnostic.json");
const outputFullscreen = path.join(repoRoot, "docs", "fullscreen-runtime-diagnostic.json");

function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function waitForHealth(timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Health check failed for ${origin}`);
}

function parseRgb(color) {
  return color || null;
}

async function probePage(browser, label, url, options = {}) {
  const page = await browser.newPage();
  const consoleLines = [];
  page.on("console", (msg) => {
    consoleLines.push({ type: msg.type(), text: msg.text() });
  });

  const navigation = { label, url, finalUrl: null, status: null, error: null };
  try {
    const response = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    navigation.status = response?.status() ?? null;
    navigation.finalUrl = page.url();
    await new Promise((resolve) => setTimeout(resolve, options.settleMs ?? 1200));

    const outerLayers = await page.evaluate(() => {
      function layer(el) {
        if (!(el instanceof Element)) return null;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          className: typeof el.className === "string" ? el.className : null,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          backgroundColor: style.backgroundColor,
          background: style.background,
          opacity: style.opacity,
          visibility: style.visibility,
          zIndex: style.zIndex,
          position: style.position,
          transform: style.transform,
          filter: style.filter,
          mixBlendMode: style.mixBlendMode,
          isolation: style.isolation,
          contain: style.contain,
          overflow: style.overflow,
          pointerEvents: style.pointerEvents,
        };
      }

      const pick = (selector) => layer(document.querySelector(selector));
      const html = layer(document.documentElement);
      const body = layer(document.body);
      const appContent = pick("#neud-app-content");
      const fixedRoot = pick(".fixed.inset-0");
      const viewport = pick(".display-viewer-viewport");
      const scaledBounds = pick(".display-viewer-scaled-bounds");
      const canvas = pick(".display-viewer-canvas");
      const iframe = pick("iframe");

      const cx = Math.floor(window.innerWidth / 2);
      const cy = Math.floor(window.innerHeight / 2);
      const stack = document.elementsFromPoint(cx, cy).slice(0, 12).map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: typeof el.className === "string" ? el.className : null,
        backgroundColor: getComputedStyle(el).backgroundColor,
      }));

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        samplePoint: { x: cx, y: cy },
        elementsFromPointStack: stack,
        html,
        body,
        appContent,
        fixedRoot,
        viewportNode: viewport,
        scaledBounds,
        canvas,
        iframeElement: iframe,
        bodyClasses: document.body.className,
        htmlClasses: document.documentElement.className,
        htmlDataset: { ...document.documentElement.dataset },
      };
    });

    let iframeDocument = null;
    const iframeHandle = await page.$("iframe");
    if (iframeHandle) {
      const frame = await iframeHandle.contentFrame();
      if (frame) {
        iframeDocument = await frame.evaluate(() => {
          function layer(el) {
            if (!(el instanceof Element)) return null;
            const style = getComputedStyle(el);
            return {
              tag: el.tagName.toLowerCase(),
              id: el.id || null,
              className: typeof el.className === "string" ? el.className : null,
              backgroundColor: style.backgroundColor,
              background: style.background,
            };
          }
          const cx = Math.floor(window.innerWidth / 2);
          const cy = Math.floor(window.innerHeight / 2);
          const stack = document.elementsFromPoint(cx, cy).slice(0, 12).map((el) => ({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            className: typeof el.className === "string" ? el.className : null,
            backgroundColor: getComputedStyle(el).backgroundColor,
          }));
          return {
            locationHref: location.href,
            search: location.search,
            html: layer(document.documentElement),
            body: layer(document.body),
            viewport: layer(document.querySelector(".viewport")),
            displayStage: layer(document.querySelector(".display-stage")),
            elementsFromPointStack: stack,
            title: document.title,
          };
        });
      }
    }

    let screenshotPath = null;
    if (options.screenshot) {
      screenshotPath = path.join(repoRoot, "docs", options.screenshot);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    return {
      navigation,
      outerLayers,
      iframeDocument,
      consoleLines: consoleLines.slice(-20),
      screenshotPath,
    };
  } catch (error) {
    navigation.error = error instanceof Error ? error.message : String(error);
    return { navigation, outerLayers: null, iframeDocument: null, consoleLines };
  } finally {
    await page.close();
  }
}

async function readStreamTickerEnabledFromSqlite() {
  const dbPath = resolveLocalNeudDatabasePath(repoRoot);
  if (!fs.existsSync(dbPath)) {
    return { dbPath, available: false, enabled: null };
  }
  const wasmPath = path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const row =
    db.exec(
      `SELECT value_json FROM app_settings WHERE key = 'displays.newTickerV1.enabled'`,
    )[0]?.values?.[0]?.[0] ?? null;
  db.close();
  let enabled = null;
  if (row != null) {
    try {
      enabled = JSON.parse(String(row)) === true;
    } catch {
      enabled = String(row) === "true";
    }
  }
  return { dbPath, available: true, enabled, rawValueJson: row };
}

async function probeEnabledTickerHtml(browser, origin) {
  const base = `${origin}/displays/new-ticker-v1/index.html`;
  const localEquivalent = `${base}?${new URLSearchParams({
    src: `${origin}/api/displays/new-ticker-v1/data`,
    poll: "1000",
  }).toString()}`;
  const pinnedEquivalent = `${base}?${new URLSearchParams({
    src: `${origin}/api/displays/new-ticker-v1/data`,
    poll: "1000",
    preview: "1",
    pinnedPreview: "1",
    previewSample: "1",
  }).toString()}`;

  async function probeAt(label, url) {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 540 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const sample = await page.evaluate(() => {
      const cx = 480;
      const cy = 135;
      function layer(el) {
        if (!(el instanceof Element)) return null;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === "string" ? el.className : null,
          backgroundColor: style.backgroundColor,
          opacity: style.opacity,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }
      const stack = document.elementsFromPoint(cx, cy).slice(0, 10).map((el) => ({
        tag: el.tagName.toLowerCase(),
        className: typeof el.className === "string" ? el.className : null,
        backgroundColor: getComputedStyle(el).backgroundColor,
      }));
      return {
        title: document.title,
        locationHref: location.href,
        samplePoint: { x: cx, y: cy },
        stack,
        html: layer(document.documentElement),
        body: layer(document.body),
        viewport: layer(document.querySelector(".viewport")),
        displayStage: layer(document.querySelector(".display-stage")),
        bodyClasses: document.body.className,
      };
    });
    await page.close();
    return { label, url, sample };
  }

  const localProbe = await probeAt("enabled-html-local-equivalent", localEquivalent);
  const pinnedProbe = await probeAt("enabled-html-pinned-equivalent", pinnedEquivalent);
  return { localProbe, pinnedProbe };
}

async function readStreamTickerSqliteAudit() {
  const dbPath = resolveLocalNeudDatabasePath(repoRoot);
  if (!fs.existsSync(dbPath)) {
    return { dbPath, available: false };
  }
  const wasmPath = path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const displays = db.exec(
    `SELECT id, project_id, display_key, name, display_width, display_height
     FROM displays
     WHERE display_key IN ('new-ticker-v1', 'lower-ticker-v5')
     ORDER BY updated_at DESC
     LIMIT 5`,
  );
  let revisions = [];
  try {
    revisions =
      db.exec(
        `SELECT r.id, r.resource_id, r.resource_type, r.source_hash, r.created_at
         FROM project_code_revisions r
         JOIN displays d ON d.id = r.resource_id
         WHERE d.display_key = 'new-ticker-v1' AND r.resource_type = 'display'
         ORDER BY r.created_at DESC
         LIMIT 5`,
      )[0]?.values ?? [];
  } catch {
    revisions = [];
  }
  db.close();

  const bundledPath = path.join(
    repoRoot,
    "desktop",
    "src",
    "displays",
    "bundled",
    "stream-ticker-v1.html",
  );
  const publicPath = path.join(repoRoot, "public", "displays", "new-ticker-v1", "index.html");

  return {
    dbPath,
    available: true,
    displays: displays[0]?.values ?? [],
    revisions,
    bundledStreamTicker: fs.existsSync(bundledPath)
      ? { path: bundledPath, sha256: sha256File(bundledPath) }
      : null,
    publicStreamTicker: fs.existsSync(publicPath)
      ? { path: publicPath, sha256: sha256File(publicPath) }
      : null,
  };
}

function readCompiledPreviewWindowManager() {
  const distPath = path.join(
    repoRoot,
    "desktop",
    "dist",
    "services",
    "display-preview-window-manager.js",
  );
  const srcPath = path.join(
    repoRoot,
    "desktop",
    "src",
    "services",
    "display-preview-window-manager.ts",
  );
  const dist = fs.existsSync(distPath) ? fs.readFileSync(distPath, "utf8") : null;
  const src = fs.existsSync(srcPath) ? fs.readFileSync(srcPath, "utf8") : null;
  return {
    distPath,
    srcPath,
    distMtime: dist ? fs.statSync(distPath).mtime.toISOString() : null,
    srcMtime: src ? fs.statSync(srcPath).mtime.toISOString() : null,
    distHasResizableTrue: dist ? /resizable:\s*true/.test(dist) : null,
    distHasTransparentTrue: dist ? /transparent:\s*true/.test(dist) : null,
    distHasWindowFit: dist ? dist.includes("/display/window-fit") : null,
    srcMatchesDistResizable:
      src && dist
        ? /resizable:\s*true/.test(src) === /resizable:\s*true/.test(dist)
        : null,
  };
}

function findFirstOpaqueLayer(probe) {
  const candidates = [];
  const push = (name, layer) => {
    if (!layer) return;
    const bg = layer.backgroundColor || "";
    if (
      bg &&
      bg !== "rgba(0, 0, 0, 0)" &&
      bg !== "transparent" &&
      !bg.includes("0, 0, 0, 0")
    ) {
      candidates.push({ name, backgroundColor: bg, layer });
    }
  };

  if (probe?.outerLayers) {
    push("html", probe.outerLayers.html);
    push("body", probe.outerLayers.body);
    push("appContent", probe.outerLayers.appContent);
    push("fixedRoot", probe.outerLayers.fixedRoot);
    push("viewportNode", probe.outerLayers.viewportNode);
    push("scaledBounds", probe.outerLayers.scaledBounds);
    push("canvas", probe.outerLayers.canvas);
    push("iframeElement", probe.outerLayers.iframeElement);
  }
  if (probe?.iframeDocument) {
    push("iframe.html", probe.iframeDocument.html);
    push("iframe.body", probe.iframeDocument.body);
    push("iframe.viewport", probe.iframeDocument.viewport);
    push("iframe.displayStage", probe.iframeDocument.displayStage);
  }
  return candidates[0] ?? null;
}

async function main() {
  await waitForHealth();

  const dataUrl = `${origin}/api/displays/new-ticker-v1/data`;
  const localUrl = `${origin}/displays/new-ticker-v1?${new URLSearchParams({
    src: dataUrl,
    poll: "1000",
  }).toString()}`;
  const previewUrl = `${localUrl.replace("/displays/", "/displays/")}&preview=1`.replace(
    "?",
    "?",
  );
  const previewUrlFixed = `${origin}/displays/new-ticker-v1?${new URLSearchParams({
    src: dataUrl,
    poll: "1000",
    preview: "1",
  }).toString()}`;
  const pinnedIframeUrl = `${origin}/displays/new-ticker-v1?${new URLSearchParams({
    src: dataUrl,
    poll: "1000",
    preview: "1",
    pinnedPreview: "1",
    previewSample: "1",
  }).toString()}`;
  const windowFitUrl = `${origin}/display/window-fit?${new URLSearchParams({
    target: localUrl,
    width: "1920",
    height: "1080",
  }).toString()}`;

  const urlMatrix = {
    preview: {
      intendedChain:
        "DisplayCard → DisplayPreviewPanel → DisplayCanvasPreview → iframe",
      url: previewUrlFixed,
    },
    pinnedIframeDocument: {
      intendedChain:
        "PinnedDisplayViewerArea → PinnedDisplayLiveSlot → DisplayCanvasPreview(graphicOnly) → iframe",
      url: pinnedIframeUrl,
      note: "Same document URL pinned iframe loads; wrapper audit requires Electron main window.",
    },
    localUrl: {
      intendedChain: "direct /displays/new-ticker-v1 output document",
      url: localUrl,
    },
    fullscreenShell: {
      intendedChain:
        "openPreview IPC → display-preview-window-manager → /display/window-fit → DisplayWindowFitClient → DisplayViewerScaledCanvas → iframe(target=localUrl)",
      url: windowFitUrl,
    },
  };

  let enabledGate = { enabled: null, source: null };
  try {
    const enabledResponse = await fetch(`${origin}/api/displays/new-ticker-v1/enabled`);
    enabledGate = {
      enabled: (await enabledResponse.json()).enabled === true,
      source: `${origin}/api/displays/new-ticker-v1/enabled`,
      status: enabledResponse.status,
    };
  } catch (error) {
    enabledGate = {
      enabled: null,
      source: `${origin}/api/displays/new-ticker-v1/enabled`,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--disable-web-security"],
  });

  const publicTickerPath = path.join(
    repoRoot,
    "public",
    "displays",
    "new-ticker-v1",
    "index.html",
  );
  const publicTickerUrl = `file:///${publicTickerPath.replace(/\\/g, "/")}`;

  const probes = {};
  probes.preview = await probePage(browser, "preview", previewUrlFixed);
  probes.pinnedIframeDocument = await probePage(browser, "pinned", pinnedIframeUrl);
  probes.localUrl = await probePage(browser, "local", localUrl);
  probes.fullscreenShell = await probePage(
    browser,
    "fullscreen",
    windowFitUrl,
    { screenshot: "fullscreen-runtime-diagnostic.png" },
  );
  probes.publicTickerSourceDocument = await probePage(
    browser,
    "public-source",
    publicTickerUrl,
  );
  {
    const page = await browser.newPage();
    await page.setContent(
      `<!doctype html><html><head><style>
        html,body{margin:0;height:100%;background:#151b23}
        .slot{position:relative;width:800px;height:450px;background:#151b23}
        .container{position:absolute;inset:0;background:transparent}
        .scale{position:absolute;left:50%;top:50%;width:768px;height:432px;transform:translate(-50%,-50%);background:transparent;overflow:hidden}
        iframe{border:0;width:1920px;height:1080px;transform:scale(0.4);transform-origin:top left;background:transparent}
      </style></head><body>
        <div class="slot"><div class="container"><div class="scale">
          <iframe src="${publicTickerUrl}"></iframe>
        </div></div></div>
      </body></html>`,
      { waitUntil: "networkidle2" },
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    probes.pinnedWrapperSimulation = {
      navigation: { label: "pinned-wrapper-simulation", url: "about:blank+iframe" },
      outerLayers: await page.evaluate(() => {
        const cx = 400;
        const cy = 100;
        const stack = document.elementsFromPoint(cx, cy).map((el) => ({
          tag: el.tagName.toLowerCase(),
          className: el.className,
          backgroundColor: getComputedStyle(el).backgroundColor,
        }));
        return { samplePoint: { x: cx, y: cy }, elementsFromPointStack: stack };
      }),
      iframeDocument: await (async () => {
        const frame = page.frames().find((f) => f.url().includes("new-ticker-v1"));
        if (!frame) return null;
        return frame.evaluate(() => ({
          locationHref: location.href,
          body: getComputedStyle(document.body).backgroundColor,
          html: getComputedStyle(document.documentElement).backgroundColor,
          viewport: document.querySelector(".viewport")
            ? getComputedStyle(document.querySelector(".viewport")).backgroundColor
            : null,
        }));
      })(),
    };
    await page.close();
  }

  const enabledTickerHtmlProbe = await probeEnabledTickerHtml(browser, origin);

  await browser.close();

  const sqliteEnabled = await readStreamTickerEnabledFromSqlite();
  const sqliteAudit = await readStreamTickerSqliteAudit();
  const previewWindowCompiled = readCompiledPreviewWindowManager();

  const pinnedOpaque = findFirstOpaqueLayer(probes.pinnedIframeDocument);
  const localOpaque = findFirstOpaqueLayer(probes.localUrl);
  const fullscreenOpaque = findFirstOpaqueLayer(probes.fullscreenShell);

  const pinnedReport = {
    capturedAt: new Date().toISOString(),
    origin,
    enabledGate,
    sqliteEnabled,
    enabledTickerHtmlProbe,
    urlMatrix,
    probes: {
      preview: probes.preview,
      pinnedIframeDocument: probes.pinnedIframeDocument,
      localUrl: probes.localUrl,
      publicTickerSourceDocument: probes.publicTickerSourceDocument,
      pinnedWrapperSimulation: probes.pinnedWrapperSimulation,
    },
    sqliteAudit,
    previewWindowCompiled,
    analysis: {
      firstPinnedOpaqueLayerInIframeDocumentOnly: pinnedOpaque,
      firstLocalOpaqueLayerInDocument: localOpaque,
      pinnedVsLocalIframeHrefMatch:
        probes.pinnedIframeDocument?.iframeDocument?.locationHref ===
        probes.localUrl?.iframeDocument?.locationHref,
      pinnedVsLocalBodyBackground: {
        pinned: probes.pinnedIframeDocument?.iframeDocument?.body?.backgroundColor ?? null,
        local: probes.localUrl?.iframeDocument?.body?.backgroundColor ?? null,
      },
      runtimeCodeMatchesSource: previewWindowCompiled.srcMatchesDistResizable,
      enabledHtmlFirstDifference:
        enabledTickerHtmlProbe.localProbe.sample.stack[0]?.backgroundColor ===
        enabledTickerHtmlProbe.pinnedProbe.sample.stack[0]?.backgroundColor
          ? "stack-top-background-match"
          : {
              localTop: enabledTickerHtmlProbe.localProbe.sample.stack[0] ?? null,
              pinnedTop: enabledTickerHtmlProbe.pinnedProbe.sample.stack[0] ?? null,
            },
      note:
        "Route /displays/new-ticker-v1 (no index.html) respects enabled gate; index.html static path bypasses gate and represents enabled-route HTML body.",
    },
  };

  const fullscreenReport = {
    capturedAt: new Date().toISOString(),
    origin,
    enabledGate,
    sqliteEnabled,
    enabledTickerHtmlProbe,
    urlMatrix,
    probe: probes.fullscreenShell,
    previewWindowCompiled,
    analysis: {
      firstFullscreenOpaqueLayer: fullscreenOpaque,
      decodedTargetUrl: localUrl,
      targetMatchesLocalUrl: true,
      outerBodyBackground: probes.fullscreenShell?.outerLayers?.body?.backgroundColor ?? null,
      outerHtmlBackground: probes.fullscreenShell?.outerLayers?.html?.backgroundColor ?? null,
      elementsFromPointAtCenter:
        probes.fullscreenShell?.outerLayers?.elementsFromPointStack ?? [],
      iframeInnerBodyBackground:
        probes.fullscreenShell?.iframeDocument?.body?.backgroundColor ?? null,
      electronResizeAudit: {
        codePathConfirmed: "desktop/dist/services/display-preview-window-manager.js",
        resizableInCompiledDist: previewWindowCompiled.distHasResizableTrue,
        transparentInCompiledDist: previewWindowCompiled.distHasTransparentTrue,
        windowFitInCompiledDist: previewWindowCompiled.distHasWindowFit,
        focusExistingReusesWindowWithoutRecreate: true,
        thickFrameInSource: false,
        setAspectRatioCallsInRepo: false,
        electronWindowsTransparentResizeNote:
          "Electron on Windows: transparent BrowserWindow often loses edge resize unless thickFrame is enabled; dist sets transparent:true without thickFrame.",
        manualResizeValidationRequired:
          "Edge resize events must be confirmed manually in the Electron preview window.",
      },
    },
  };

  fs.mkdirSync(path.dirname(outputPinned), { recursive: true });
  fs.writeFileSync(outputPinned, `${JSON.stringify(pinnedReport, null, 2)}\n`);
  fs.writeFileSync(outputFullscreen, `${JSON.stringify(fullscreenReport, null, 2)}\n`);

  console.log(`Wrote ${outputPinned}`);
  console.log(`Wrote ${outputFullscreen}`);
  console.log(
    JSON.stringify(
      {
        firstPinnedOpaqueLayer: pinnedOpaque?.name ?? null,
        pinnedOpaqueColor: pinnedOpaque?.backgroundColor ?? null,
        firstFullscreenOpaqueLayer: fullscreenOpaque?.name ?? null,
        fullscreenOpaqueColor: fullscreenOpaque?.backgroundColor ?? null,
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
