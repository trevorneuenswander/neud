/**
 * B4 - Stream Bid Local URL keeps its authored white; Stream Ticker keeps real transparency.
 *
 * Layers traced for a Local URL (/display/<project>/<slug>):
 *   Next output route -> HtmlDisplayOutputView (meta fetch, transparent placeholder)
 *   -> /api/display-html proxy -> local API resolveDisplayViewer (published HTML)
 *   -> wrapStandaloneDisplayHtml (output-mode CSS) -> browser pixels.
 *
 * Windows-path coverage: CRLF + UTF-8 BOM published HTML, Windows file references,
 * slug/duplicate variants, fractional DPR, nested iframe host, and the host-state retry
 * that keeps a not-yet-ready Local URL from staying permanently empty.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadValidationPuppeteer } from "./lib/resolve-validation-browser.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const templates = await import("../dist/developer-tools/templates.js");
const transforms = await import("../dist/displays/stream-display-v2-transform.js");
const bundled = await import("../dist/lib/bundled-display-sources.js");
const outputState = await import("../../src/lib/displays/html-display-output-state.ts");

const BRIDGE_STUB = "/* stream bridge */";
const STREAM_BID_BASE = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
const STREAM_TICKER_BASE = read("desktop/src/displays/bundled/stream-ticker-v1.html");
const streamBidServed = transforms.transformStreamBidHtmlForServing(STREAM_BID_BASE, BRIDGE_STUB);
const streamTickerServed = transforms.transformStreamTickerHtmlForServing(
  STREAM_TICKER_BASE,
  BRIDGE_STUB,
);

function toWindowsAuthored(html, { bom = true, leadingNewlines = "" } = {}) {
  const crlf = html.replace(/\r?\n/g, "\r\n");
  return `${bom ? "\uFEFF" : ""}${leadingNewlines}${crlf}`;
}

function wrapOutput(html, slug, extra = {}) {
  return templates.wrapStandaloneDisplayHtml({
    html,
    dataUrl: "/api/display-data/test",
    displayInfo: { slug, displayKey: slug, name: slug },
    viewportWidth: 1920,
    viewportHeight: 1080,
    outputMode: true,
    ...extra,
  });
}

// ---------------------------------------------------------------- wrapper CSS layer

test("output wrapper keeps Stream Bid's authored background but never overrides it", () => {
  const wrapped = wrapOutput(streamBidServed, "stream-bid-display");
  assert.doesNotMatch(wrapped, /background:transparent!important/);
  assert.match(wrapped, /stream-bid-pip-mask/);
});

test("Stream Bid is detected from its HTML, not only its slug", () => {
  for (const slug of ["stream-bid-display", "Stream-Bid-Display", "stream-bid-display-2", "my-bid-copy", ""]) {
    assert.equal(
      templates.outputPaintsOwnBackground({ html: streamBidServed, slug }),
      true,
      `content detection must hold for slug "${slug}"`,
    );
    const wrapped = wrapOutput(streamBidServed, slug || "x");
    assert.doesNotMatch(wrapped, /background:transparent!important/, `slug "${slug}"`);
  }
  // Slug-only fallback (document served before markers are injected).
  assert.equal(templates.outputPaintsOwnBackground({ html: "<html></html>", slug: "stream-bid-display" }), true);
});

test("Stream Ticker and unrelated displays still get a forced transparent output page", () => {
  assert.equal(templates.outputPaintsOwnBackground({ html: streamTickerServed, slug: "stream-ticker" }), false);
  const wrapped = wrapOutput(streamTickerServed, "stream-ticker");
  assert.match(wrapped, /html,body\{[^}]*background:transparent!important/);

  const generic = wrapOutput("<!doctype html><html><body>x</body></html>", "anything");
  assert.match(generic, /background:transparent!important/);
});

test("buildDisplayDocument applies the same rule (no global transparent override)", () => {
  const build = (html, slug) =>
    templates.buildDisplayDocument({
      html,
      css: "",
      javascript: "",
      displayInfo: { slug, displayKey: slug },
      outputMode: true,
    });
  assert.doesNotMatch(build(streamBidServed, "stream-bid-display"), /background: transparent !important/);
  assert.match(build(streamTickerServed, "stream-ticker"), /background: transparent !important/);
});

test("output mode is never applied to the non-output (preview / fullscreen) path", () => {
  const wrapped = templates.wrapStandaloneDisplayHtml({
    html: streamTickerServed,
    dataUrl: "/api/display-data/test",
    displayInfo: { slug: "stream-ticker" },
    outputMode: false,
  });
  assert.doesNotMatch(wrapped, /background:transparent!important/);
});

// ------------------------------------------------------------- Windows path coverage

test("standalone detection tolerates BOM, CRLF and leading whitespace (Windows-authored files)", () => {
  const variants = [
    streamBidServed,
    toWindowsAuthored(streamBidServed),
    toWindowsAuthored(streamBidServed, { bom: false, leadingNewlines: "\r\n\r\n  " }),
    toWindowsAuthored(streamBidServed, { bom: true, leadingNewlines: "\r\n" }),
  ];
  for (const html of variants) {
    assert.equal(templates.isStandaloneHtmlDocument(html), true);
  }
  assert.equal(templates.isStandaloneHtmlDocument("<div>fragment</div>"), false);
  assert.equal(templates.isStandaloneHtmlDocument("<style>.a{}</style><div></div>"), false);
});

test("a BOM+CRLF published Stream Bid is wrapped as a standalone document (not nested)", () => {
  const winHtml = toWindowsAuthored(streamBidServed);
  const wrapped = wrapOutput(winHtml, "stream-bid-display");
  // A non-standalone wrap would inject a second <html>/<body>; there must be exactly one.
  assert.equal((wrapped.match(/<html[\s>]/gi) ?? []).length, 1);
  assert.equal((wrapped.match(/<body[\s>]/gi) ?? []).length, 1);
  assert.doesNotMatch(wrapped, /background:transparent!important/);
});

test("bundled display references resolve identically for Windows and POSIX paths", () => {
  const expected = "stream-bid-display-v1.html";
  const references = [
    "desktop/src/displays/bundled/stream-bid-display-v1.html",
    "desktop\\src\\displays\\bundled\\stream-bid-display-v1.html",
    "C:\\Program Files\\NEUD\\resources\\app\\dist\\displays\\bundled\\stream-bid-display-v1.html",
    path.win32.join("C:\\NEUD", "bundled", expected),
    path.posix.join("/opt/neud/bundled", expected),
    expected,
  ];
  for (const reference of references) {
    assert.equal(bundled.bundledDisplayFileNameFromReference(reference), expected, reference);
  }
  const html = bundled.readBundledDisplaySourceFromReference(references[1]);
  assert.match(html, /stream-bid-pip-mask/);
  assert.equal(html.charCodeAt(0) === 0xfeff, false);
});

// ------------------------------------------------------------ host state + retry layer

test("host state: only an enabled, published display is ready", () => {
  const { resolveHtmlDisplayOutputState: state } = outputState;
  assert.equal(state({ resolved: false, meta: null }), "resolving");
  assert.equal(state({ resolved: true, meta: null }), "unavailable");
  assert.equal(state({ resolved: true, meta: { enabled: false, publishedRevisionId: "r1" } }), "disabled");
  assert.equal(state({ resolved: true, meta: { enabled: true, publishedRevisionId: null } }), "unpublished");
  assert.equal(state({ resolved: true, meta: { enabled: true, publishedRevisionId: "r1" } }), "ready");
  assert.equal(
    state({ resolved: true, meta: { enabled: true, publishedRevisionId: null }, fallbackPublishedRevisionId: "r0" }),
    "ready",
  );
});

test("host retry: every non-ready state retries with capped backoff; ready stops", () => {
  const { shouldRetryHtmlDisplayOutputMeta: retry, nextHtmlDisplayOutputRetryDelayMs: delay } = outputState;
  for (const s of ["resolving", "unavailable", "disabled", "unpublished"]) assert.equal(retry(s), true, s);
  assert.equal(retry("ready"), false);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 50].map(delay), [500, 1000, 2000, 4000, 5000, 5000, 5000]);
  assert.equal(delay(-3), 500);
});

test("HtmlDisplayOutputView retries metadata instead of resolving once", () => {
  const source = read("src/components/displays/broad-arrow/HtmlDisplayOutputView.tsx");
  assert.match(source, /shouldRetryHtmlDisplayOutputMeta/);
  assert.match(source, /nextHtmlDisplayOutputRetryDelayMs/);
  assert.match(source, /clearTimeout/);
  assert.match(source, /outputState !== "ready"/);
  // The Local URL host must stay transparent; the authored white comes from the display HTML.
  assert.doesNotMatch(source, /background:\s*"(#fff|white|#ffffff)"/i);
});

// ------------------------------------------------------------------ real browser pixels

function startServer(documents) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/host") {
      // Mirrors HtmlDisplayOutputView: transparent root + transparent full-size iframe.
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(
        `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent!important;overflow:hidden}` +
          `iframe{display:block;border:0;width:1920px;height:1080px;background:transparent}</style></head>` +
          `<body><div class="display-output-root" style="width:1920px;height:1080px;overflow:hidden;background:transparent">` +
          `<iframe src="/doc/${url.searchParams.get("doc")}"></iframe></div></body></html>`,
      );
      return;
    }
    const match = url.pathname.match(/^\/doc\/(.+)$/);
    if (match && documents[match[1]] !== undefined) {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(documents[match[1]]);
      return;
    }
    if (url.pathname === "/neud-display-runtime.js" || url.pathname.startsWith("/api/")) {
      response.statusCode = 204;
      response.end();
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function readPixels(browser, base64Png, points) {
  const reader = await browser.newPage();
  try {
    return await reader.evaluate(
      async (b64, pts) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        return pts.map(([x, y]) => {
          const px = Math.min(bitmap.width - 1, Math.round((x / 1920) * bitmap.width));
          const py = Math.min(bitmap.height - 1, Math.round((y / 1080) * bitmap.height));
          const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
          return { x, y, r, g, b, a };
        });
      },
      base64Png,
      points,
    );
  } finally {
    await reader.close();
  }
}

const GRID = [];
for (let y = 60; y < 1080; y += 120) for (let x = 60; x < 1920; x += 120) GRID.push([x, y]);

async function capture(browser, port, doc, deviceScaleFactor) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor });
    await page.goto(`http://127.0.0.1:${port}/host?doc=${doc}`, { waitUntil: "load" });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const png = await page.screenshot({ omitBackground: true, encoding: "base64" });
    return await readPixels(browser, png, GRID);
  } finally {
    await page.close();
  }
}

const summarize = (pixels) => ({
  opaqueWhite: pixels.filter((p) => p.a === 255 && p.r >= 250 && p.g >= 250 && p.b >= 250).length,
  transparent: pixels.filter((p) => p.a === 0).length,
  total: pixels.length,
});

test("browser pixels: Stream Bid Local URL keeps opaque white, Stream Ticker stays transparent", async (t) => {
  let runtime;
  try {
    runtime = await loadValidationPuppeteer();
  } catch (error) {
    t.skip(`puppeteer unavailable: ${error instanceof Error ? error.message : error}`);
    return;
  }
  const browser = await runtime.puppeteer.launch(runtime.launchOptions);

  const documents = {
    "bid-canonical": wrapOutput(streamBidServed, "stream-bid-display"),
    "bid-windows": wrapOutput(toWindowsAuthored(streamBidServed), "stream-bid-display"),
    "bid-windows-ws": wrapOutput(
      toWindowsAuthored(streamBidServed, { bom: false, leadingNewlines: "\r\n  " }),
      "stream-bid-display",
    ),
    "bid-duplicate": wrapOutput(streamBidServed, "stream-bid-display-2"),
    "bid-renamed": wrapOutput(toWindowsAuthored(streamBidServed), "my-bid-copy"),
    "ticker-canonical": wrapOutput(streamTickerServed, "stream-ticker"),
    "ticker-windows": wrapOutput(toWindowsAuthored(streamTickerServed), "stream-ticker"),
  };
  const server = await startServer(documents);
  const port = server.address().port;

  try {
    for (const dpr of [1, 1.25, 1.5]) {
      for (const doc of Object.keys(documents).filter((name) => name.startsWith("bid-"))) {
        const stats = summarize(await capture(browser, port, doc, dpr));
        assert.ok(
          stats.opaqueWhite >= stats.total * 0.25,
          `${doc} @${dpr}x: expected authored opaque white, got ${JSON.stringify(stats)}`,
        );
      }
      for (const doc of Object.keys(documents).filter((name) => name.startsWith("ticker-"))) {
        const stats = summarize(await capture(browser, port, doc, dpr));
        assert.equal(stats.opaqueWhite, 0, `${doc} @${dpr}x must not paint white: ${JSON.stringify(stats)}`);
        assert.ok(
          stats.transparent >= stats.total * 0.5,
          `${doc} @${dpr}x: expected real transparency, got ${JSON.stringify(stats)}`,
        );
      }
    }
  } finally {
    server.close();
    await browser.close();
  }
});
