#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const LEGACY_TICKER = {
  slug: "legacy-ticker",
  projectId: "8526be86-4f8a-4522-8506-efa8a25fe903",
};
const OVERLAY_SLUG = "auction-ticker-overlay";

test("display data route reports enabled state even in preview mode", () => {
  const api = readSrc("desktop/src/services/local-api-server.ts");
  const customBlock = api.slice(
    api.indexOf('action === "data" && request.method === "GET"'),
    api.indexOf('if (!action && request.method === "GET")'),
  );
  assert.match(customBlock, /previewMode/);
  assert.match(customBlock, /dataConnected = previewMode \|\| viewerState\.enabled/);
});

test("connection toggle does not reload iframe viewers", () => {
  const client = readSrc("src/lib/displays/display-connection-client.ts");
  const notifyBlock = client.slice(
    client.indexOf("export function notifyDisplayConnectionChanged"),
    client.indexOf("export function requestDisplayViewerReload"),
  );
  assert.doesNotMatch(notifyBlock, /requestDisplayViewerReload/);
});

test("runtime resumes polling immediately when re-enabled", () => {
  const runtime = readSrc("public/neud-display-runtime.js");
  assert.match(runtime, /window\.__NEUD_RUNTIME_RESUME__/);
  assert.match(runtime, /function resumePolling\(\)/);
  assert.match(
    runtime,
    /payload\.enabled === false[\s\S]{0,120}applyPayload\(payload\)/,
  );
});

test("fetch guard resumes runtime polling without reloading", () => {
  const templates = readSrc("desktop/src/developer-tools/templates.ts");
  assert.match(templates, /function resumeDisplayPolling\(\)/);
  assert.match(templates, /window\.__NEUD_RUNTIME_RESUME__/);
  assert.match(templates, /resumeDisplayPolling\(\)/);
});

test("legacy ticker fallback only runs outside NEUD runtime", () => {
  const bridge = readSrc("desktop/src/displays/legacy-ticker-live-bridge.js");
  assert.match(bridge, /function isInsideNeudRuntime\(\)/);
  assert.match(bridge, /isInsideNeudRuntime\(\)/);
  assert.match(
    bridge,
    /startOptionalLegacyFallback[\s\S]{0,120}isInsideNeudRuntime\(\)/,
  );
});

test("developer HTML card keeps preview mounted when polling disabled", () => {
  const card = readSrc("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /keepPreviewWhenDisabled/);
  assert.doesNotMatch(
    card,
    /handleEnabledChange[\s\S]{0,500}closePreview/,
  );
});

test("developer HTML card does not reload iframe when toggling enabled", () => {
  const card = readSrc("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.doesNotMatch(
    card,
    /useEffect\([\s\S]{0,200}enabled[\s\S]{0,200}requestDisplayViewerReload/,
  );
});

test("developer HTML card toggles enabled by display id", () => {
  const card = readSrc("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /localSetDeveloperDisplayEnabled\([\s\S]*display\.id/);
  assert.match(card, /notifyDisplayConnectionChanged\(display\.id/);
});

test("toggle persistence uses display id not slug-only lookup", () => {
  const api = readSrc("src/lib/local/developer-tools-api.ts");
  assert.match(
    api,
    /developer-tools\/displays\/\$\{encodeURIComponent\(displayId\)\}\/enabled/,
  );
});

test("fullscreen opens the same output URL as Copy Local URL", () => {
  const card = readSrc("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /localDisplayUrl/);
  assert.match(card, /viewerUrl: outputTargetUrl/);
  assert.match(card, /outputTargetUrl = localDisplayUrl/);
  assert.doesNotMatch(card, /handleViewFullscreen[\s\S]{0,400}preview: "1"/);
});

test("HtmlDisplayLiveView uses iframe load phases instead of location.replace", () => {
  const liveView = readSrc("src/components/displays/broad-arrow/HtmlDisplayLiveView.tsx");
  assert.doesNotMatch(liveView, /location\.replace/);
  assert.match(liveView, /"resolving" \| "loading" \| "loaded" \| "error"/);
  assert.match(liveView, /onLoad=\{handleIframeLoad\}/);
  assert.match(liveView, /publishedRevisionId/);
  assert.match(liveView, /LOAD_TIMEOUT_MS/);
  assert.match(liveView, /Retry/);
});

test("HtmlDisplayLiveView scales fixed canvas to fit viewer", () => {
  const liveView = readSrc("src/components/displays/broad-arrow/HtmlDisplayLiveView.tsx");
  const scaled = readSrc("src/components/displays/DisplayViewerScaledCanvas.tsx");
  assert.match(liveView, /DisplayViewerScaledCanvas/);
  assert.match(scaled, /transform: `scale\(\$\{scale\}\)`/);
  assert.match(scaled, /ResizeObserver/);
});

test("HtmlDisplayLiveView resolves legacy-ticker as generic HTML display", () => {
  const livePage = readSrc("src/components/displays/DisplayLivePageClient.tsx");
  assert.match(livePage, /HtmlDisplayLiveView/);
  assert.match(livePage, /resolveRendererKey/);
  assert.match(livePage, /publishedRevisionId/);
  assert.doesNotMatch(
    livePage,
    /legacy-ticker[\s\S]{0,200}BroadArrowLiveDisplayView/,
  );
});

test("display meta includes publishedRevisionId and displayId", () => {
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /publishedRevisionId: code\.publishedRevisionId/);
  assert.match(service, /displayId: code\.displayId/);
});

test("management preview and graphic output shells use transparent backgrounds", () => {
  const preview = readSrc("src/components/displays/DisplayCanvasPreview.tsx");
  const liveView = readSrc("src/components/displays/broad-arrow/HtmlDisplayLiveView.tsx");
  const scaled = readSrc("src/components/displays/DisplayViewerScaledCanvas.tsx");
  const shell = readSrc("src/lib/displays/display-graphic-output-shell.ts");
  assert.match(preview, /bg-transparent/);
  assert.match(preview, /backgroundColor: "transparent"/);
  assert.match(liveView, /DISPLAY_GRAPHIC_OUTPUT_BACKGROUND/);
  assert.match(scaled, /DISPLAY_GRAPHIC_OUTPUT_BACKGROUND/);
  assert.match(shell, /transparent/);
});

test("electron preview window opens resizable window-fit viewer", () => {
  const manager = readSrc("desktop/src/services/display-preview-window-manager.ts");
  const card = readSrc("src/components/displays/DisplayCard.tsx");
  const windowFit = readSrc("src/components/displays/DisplayWindowFitClient.tsx");
  assert.match(manager, /resolveDisplayWindowBounds/);
  assert.match(manager, /transparent: false/);
  assert.match(manager, /resizable: true/);
  assert.match(manager, /display\/window-fit/);
  assert.match(windowFit, /useDisplayWindowFitViewerStyles/);
  assert.match(card, /buildDisplayWindowFitPath/);
  assert.match(card, /viewerUrl: outputTargetUrl/);
  assert.doesNotMatch(card, /handleViewFullscreen[\s\S]{0,200}preview=1/);
});

test("legacy ticker card scopes updates to display record slug prop", () => {
  const card = readSrc("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /display\.slug/);
  assert.doesNotMatch(card, new RegExp(OVERLAY_SLUG));
});
