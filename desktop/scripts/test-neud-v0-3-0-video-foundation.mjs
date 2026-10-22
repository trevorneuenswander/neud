/**
 * Static acceptance checks for NEUD v0.3.0 video display foundation +
 * Output / SEMA UI polish (items 1–4 + 5A–5C foundation).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

test("OutputManager keeps route errors on cards only", () => {
  const src = read("src/components/output/OutputManager.tsx");
  assert.match(src, /Route start\/stop failures surface on the card/);
  assert.match(src, /route\.session\.lastError/);
  assert.match(src, /text-danger/);
  // toggleLive must not call setError for start/stop failures
  const toggleStart = src.indexOf("async function toggleLive");
  const toggleEnd = src.indexOf("async function", toggleStart + 10);
  const toggleBody = src.slice(toggleStart, toggleEnd > 0 ? toggleEnd : undefined);
  assert.doesNotMatch(toggleBody, /setError\(/);
});

test("SEMA Schedule Ticker logo wider; decorative left lines removed", () => {
  const ticker = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  assert.match(ticker, /--logo-w:\s*576px/);
  assert.doesNotMatch(ticker, /\.bar::before/);
  assert.doesNotMatch(ticker, /\.bar::after/);
  assert.doesNotMatch(ticker, /border-right:\s*2px solid var\(--divider\)/);

  const editable = read(
    "desktop/src/displays/bundled/sema-schedule-ticker-editable-v1.html",
  );
  assert.doesNotMatch(editable, /\.layer\[data-type="rect"\]::before/);
  assert.doesNotMatch(editable, /\.layer\[data-type="rect"\]::after/);

  const catalog = read("desktop/src/packages/builtin-package-catalog.ts");
  assert.match(catalog, /SEMA_PACKAGE_BASELINE_VERSION\s*=\s*8/);
});

test("SEMA project menu exposes on-air source toggle without page navigation", () => {
  const controls = read("src/components/sema/SemaProjectSourceControls.tsx");
  assert.match(controls, /Data Source/);
  assert.match(controls, /Manual Controller/);
  assert.match(controls, /ProjectOnAirSourceToggle/);
  assert.match(controls, /postSemaAction/);
  assert.match(controls, /"source"/);
  assert.doesNotMatch(controls, /from "next\/link"|<Link/);
  assert.doesNotMatch(controls, /ConnectionStatusPill|On air:/);
  assert.doesNotMatch(controls, /href=.*google-sheet|href=.*\/controller/);

  const topBar = read("src/components/projects/ProjectTopMenuBar.tsx");
  assert.match(topBar, /SemaProjectSourceControls/);

  const sheetPage = read("src/components/sema/SemaGoogleSheetClient.tsx");
  assert.match(sheetPage, /SemaSourceStatusPill/);
  assert.match(sheetPage, /pageSource="google-sheets"/);

  const controllerPage = read("src/components/sema/SemaLocalControllerClient.tsx");
  assert.match(controllerPage, /SemaSourceStatusPill/);
  assert.match(controllerPage, /pageSource="manual"/);
  assert.match(controllerPage, /Take on air/);
});

test("Displays list includes project-video and recovers orphans", () => {
  const listService = read("desktop/src/services/local-data-service.ts");
  assert.match(listService, /project-video/);
  assert.match(listService, /code\?\.sourceType === "project-html"/);

  const page = read("src/app/(portal)/projects/[slug]/displays/page.tsx");
  assert.match(page, /project-video/);

  const client = read("src/components/displays/DisplaysPageClient.tsx");
  assert.match(client, /recoverOrphanVideoDisplays/);

  const layout = read("src/components/projects/ProjectLayoutFrame.tsx");
  assert.match(layout, /useResetProjectContentScroll|scrollTop = 0/);
  assert.match(layout, /overscroll-y-contain/);
});

test("URL Configuration disclosure preference is persisted locally", () => {
  const pref = read("src/lib/sema/url-configuration-preference.ts");
  assert.match(pref, /neud:sema:url-configuration-open:/);
  assert.match(pref, /localStorage/);
  const client = read("src/components/sema/SemaGoogleSheetClient.tsx");
  assert.match(client, /readSemaUrlConfigurationOpen/);
  assert.match(client, /writeSemaUrlConfigurationOpen/);
  assert.match(client, /onOpenChange/);
});

test("Add Display chooser offers HTML, ProRes video, and Coming Soon AI", () => {
  const chooser = read("src/components/developer-tools/AddDisplayButton.tsx");
  assert.match(chooser, /ProRes 4444 w\/ Alpha Video File/);
  assert.match(chooser, /Coming Soon/);
  assert.match(chooser, /Create with AI/);
  assert.match(chooser, /UploadHtmlDisplayForm/);
  assert.match(chooser, /UploadVideoDisplayForm/);
});

test("Native video playback is wired into Displays controls and Output Engine", () => {
  const controls = read("src/components/displays/VideoPlaybackControls.tsx");
  assert.match(controls, /Play/);
  assert.match(controls, /Pause/);
  assert.match(controls, /Restart/);
  assert.match(controls, /Stop/);
  assert.match(controls, /Loop/);

  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /VideoPlaybackControls/);

  const playback = read("desktop/src/media/video/video-playback-service.ts");
  assert.match(playback, /ensureOpen/);
  assert.match(playback, /setLoop/);

  const player = read("desktop/src/media/video/video-player-html.ts");
  assert.match(player, /WebSocket/);
  assert.match(player, /putImageData/);

  const outputCore = read("desktop/src/output/output-engine-core.ts");
  assert.doesNotMatch(outputCore, /video-decoder-unavailable/);

  const licensing = read("docs/licensing/ffmpeg-lgpl.md");
  assert.match(licensing, /LGPL/);
  assert.match(licensing, /--disable-gpl/);
});
