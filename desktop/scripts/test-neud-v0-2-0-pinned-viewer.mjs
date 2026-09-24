import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("shared pinned viewer preference helpers enforce max 4 and display order", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-preference.ts");
  const eligible = [
    { id: "a", enabled: true, archived: false },
    { id: "b", enabled: true, archived: false },
    { id: "c", enabled: false, archived: false },
    { id: "d", enabled: true, archived: true },
  ];
  const sanitized = mod.sanitizePinnedDisplayIds(["c", "a", "d", "missing"], eligible);
  assert.deepEqual(sanitized.pinnedDisplayIds, ["a"]);
  assert.deepEqual(mod.orderPinnedDisplayIds(["a", "b"], ["b", "a"]), ["b", "a"]);
  assert.equal(mod.MAX_PINNED_DISPLAYS, 4);
});

test("sqlite migration defines user_pinned_viewer_preferences", () => {
  const sql = read("desktop/src/database/migrations/037_user_pinned_viewer_preferences.sql");
  assert.match(sql, /user_pinned_viewer_preferences/);
  assert.match(sql, /pinned_display_ids/);
  assert.match(sql, /viewer_height_px/);
});

test("supabase migration defines RLS for per-user pinned viewer preferences", () => {
  const sql = read("supabase/migrations/052_user_pinned_viewer_preferences.sql");
  assert.match(sql, /user_pinned_viewer_preferences/);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /can_view_project/);
  assert.match(sql, /auth\.uid\(\) = user_id/);
});

test("local API exposes pinned viewer routes", () => {
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /projectPinnedViewerMatch/);
  assert.match(server, /getPinnedViewerState/);
  assert.match(server, /togglePinnedDisplay/);
});

test("project shell mounts pinned viewer above horizontal project nav", () => {
  const frame = read("src/components/projects/ProjectLayoutFrame.tsx");
  const pinnedIndex = frame.indexOf("PinnedDisplayViewerArea");
  const navIndex = frame.indexOf("ProjectTopMenuBar");
  assert.ok(pinnedIndex >= 0 && navIndex > pinnedIndex);
});

test("pin control sits on display cards beside version badge", () => {
  for (const file of [
    "src/components/displays/DisplayCard.tsx",
    "src/components/displays/DeveloperHtmlDisplayCard.tsx",
    "src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /DisplayPinButton/);
    assert.match(source, /DisplayVersionBadge/);
  }
});

test("pinned viewer UI avoids management chrome and supports resize handle", () => {
  const area = read("src/components/displays/PinnedDisplayViewerArea.tsx");
  assert.match(area, /cursor-ns-resize/);
  assert.match(area, /grid h-full min-h-0/);
  assert.doesNotMatch(area, /Fullscreen|Archive|Delete|Online Viewer/i);
  const slot = read("src/components/displays/PinnedDisplayLiveSlot.tsx");
  assert.match(slot, /DisplayCanvasPreview|BroadArrowTypedDisplayPreview/);
  assert.match(slot, /showSizeLabel=\{false\}/);
  assert.match(slot, /graphicOnly/);
  assert.match(slot, /previewScaleMode=\{isStreamTicker \? "layout" : "transform"\}/);
  assert.doesNotMatch(slot, /fitToContainer|scaleToFill/);
  assert.match(slot, /data-pinned-preview-wrapper/);
  assert.match(slot, /mt-0\.5.*text-center/);
  assert.doesNotMatch(slot, /Switch|Button|DisplayEditMenu/);
  assert.doesNotMatch(slot, /Preview ·/);
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");
  assert.doesNotMatch(canvas, /fitToContainer|scaleToFill/);
  assert.match(canvas, /showSizeLabel/);
  assert.match(canvas, /graphicOnly/);
  assert.match(canvas, /previewScaleMode/);
});

test("pinned graphic-only preview uses checkerboard only inside display window", () => {
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");
  const broadCanvas = read("src/components/displays/broad-arrow/BroadArrowDisplayCanvas.tsx");
  const slot = read("src/components/displays/PinnedDisplayLiveSlot.tsx");
  const transparency = read("src/lib/displays/apply-graphic-only-iframe-transparency.ts");
  assert.match(canvas, /MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE/);
  assert.match(canvas, /data-pinned-display-window=\{graphicOnly \? "" : undefined\}/);
  assert.match(canvas, /\.\.\.checkerboardStyle/);
  assert.match(broadCanvas, /data-pinned-display-window=\{graphicOnly \? "" : undefined\}/);
  assert.match(broadCanvas, /\.\.\.MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE/);
  assert.match(canvas, /scheduleGraphicOnlyIframeTransparency/);
  assert.match(canvas, /pinnedPreview: graphicOnly/);
  assert.match(transparency, /\.layout-guide/);
  assert.match(transparency, /\.viewport/);
  assert.doesNotMatch(slot, /data-pinned-checkerboard/);
  assert.doesNotMatch(slot, /MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE/);
  assert.match(slot, /data-pinned-preview-region[\s\S]*bg-surface/);
  assert.match(read("src/components/displays/PinnedDisplayViewerArea.tsx"), /bg-surface"/);
  assert.doesNotMatch(read("src/components/displays/DisplayViewerScaledCanvas.tsx"), /graphicOnly/);
});

test("pinned viewer fit algorithm preserves aspect ratio within cell bounds", async () => {
  const { computePinnedViewerFitSize } = await import(
    "../../src/lib/displays/pinned-viewer-fit.ts"
  );
  const wideCell = computePinnedViewerFitSize({
    availableWidth: 400,
    availableHeight: 200,
    displayWidth: 1920,
    displayHeight: 1080,
  });
  assert.ok(Math.abs(wideCell.width / wideCell.height - 1920 / 1080) < 0.001);
  assert.ok(wideCell.height <= 200 + 0.001);
  const tallCell = computePinnedViewerFitSize({
    availableWidth: 200,
    availableHeight: 400,
    displayWidth: 3840,
    displayHeight: 2160,
  });
  assert.ok(tallCell.width <= 200 + 0.001);
});

test("pin control uses text Pin box aligned with version badge", () => {
  const pin = read("src/components/displays/DisplayPinButton.tsx");
  assert.doesNotMatch(pin, /<svg|PinIcon/i);
  assert.match(pin, />\s*Pin\s*</);
  assert.match(pin, /aria-pressed/);
  assert.match(pin, /DISPLAY_METADATA_BADGE_BOX_CLASS/);
  assert.match(read("src/components/displays/DisplayVersionBadge.tsx"), /DISPLAY_METADATA_BADGE_BOX_CLASS/);
  assert.match(pin, /border-primary\/50 bg-primary\/10/);
  for (const file of [
    "src/components/displays/DisplayCard.tsx",
    "src/components/displays/DeveloperHtmlDisplayCard.tsx",
    "src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx",
  ]) {
    assert.match(read(file), /flex items-center gap-1/);
    assert.match(read(file), /DisplayPinButton/);
  }
});

test("pinned live slot keeps stable display id keys without iframe key churn", () => {
  const area = read("src/components/displays/PinnedDisplayViewerArea.tsx");
  assert.match(area, /key=\{display\.id\}/);
  assert.doesNotMatch(area, /iframeKey/);
  const slot = read("src/components/displays/PinnedDisplayLiveSlot.tsx");
  assert.doesNotMatch(slot, /iframeKey/);
});

test("pinned viewer provider persists across project layout routes", () => {
  const layout = read("src/app/(portal)/projects/[slug]/layout.tsx");
  assert.match(layout, /PinnedViewerProvider/);
  assert.match(layout, /ProjectLayoutFrame/);
});

test("display reorder refreshes pinned viewer order mirror", () => {
  const list = read("src/components/displays/DisplaysListClient.tsx");
  assert.match(list, /requestPinnedViewerRefresh/);
});

test("disable path clears pinned preference on first click", () => {
  for (const file of [
    "src/components/displays/DisplayCard.tsx",
    "src/components/displays/DeveloperHtmlDisplayCard.tsx",
    "src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /requestPinnedViewerUnpin/);
    assert.match(source, /localUnpinDisplayIfPinned/);
    assert.match(source, /await localUnpinDisplayIfPinned/);
  }
  const data = read("desktop/src/services/local-data-service.ts");
  assert.match(data, /unpinDisplayKeyForAllProjects/);
  assert.match(data, /setNewBidDisplayEnabled/);
  assert.match(data, /setNewTickerDisplayEnabled/);
  const routes = read("desktop/src/services/developer-tools-routes.ts");
  assert.match(routes, /unpinDisplayIfPinned/);
  const server = read("desktop/src/services/local-api-server.ts");
  assert.match(server, /action === "unpin"/);
});

test("pinned viewer uses optimistic displays for immediate band render", () => {
  const context = read("src/lib/displays/pinned-viewer-context.tsx");
  assert.match(context, /pinnedDisplays/);
  assert.match(context, /mergeOptimisticPinnedDisplays/);
  assert.match(context, /displaySummary/);
  const area = read("src/components/displays/PinnedDisplayViewerArea.tsx");
  assert.match(area, /pinnedViewer\?\.pinnedDisplays/);
  assert.match(read("src/lib/displays/pinned-viewer-pin-diagnostics.ts"), /firstPinFailureStage/);
});

test("display cards pass pin summaries for optimistic viewer slots", () => {
  for (const file of [
    "src/components/displays/DisplayCard.tsx",
    "src/components/displays/DeveloperHtmlDisplayCard.tsx",
    "src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /buildPinnedViewerDisplaySummary/);
    assert.match(source, /displaySummary=\{pinnedViewerSummary\}/);
  }
});

test("pinned stream ticker keeps native iframe resolution with presentation scale", () => {
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");
  assert.match(canvas, /usePinnedNativeResolution = graphicOnly/);
  assert.match(canvas, /usePinnedNativeResolution/);
  assert.match(canvas, /useLayoutFrame \? undefined : `scale\(\$\{scale\}\)`/);
  assert.match(canvas, /pinnedPreview/);
  assert.match(canvas, /previewSample/);
  assert.match(canvas, /iframeWidth = useLayoutFrame \? layoutFrame\.width : displayWidth/);
  const slot = read("src/components/displays/PinnedDisplayLiveSlot.tsx");
  assert.doesNotMatch(slot, /scaleToFill|fitToContainer/);
});

test("pinned preview keeps displayWidth by displayHeight iframe backing size", () => {
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");
  assert.match(canvas, /usePinnedNativeResolution/);
  assert.match(canvas, /iframeWidth = useLayoutFrame \? layoutFrame\.width : displayWidth/);
  assert.match(canvas, /iframeHeight = useLayoutFrame \? layoutFrame\.height : displayHeight/);
});

test("pinned preview iframe passes pinnedPreview when graphicOnly", () => {
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");
  assert.match(canvas, /buildPreviewUrl\(viewerUrl, iframeRevisionId,/);
  assert.match(canvas, /pinnedPreview: graphicOnly/);
  assert.match(canvas, /outputShell: graphicOnly/);
  assert.match(canvas, /url\.searchParams\.delete\("preview"\)/);
});

test("viewport diagnostics overlay is opt-in only", () => {
  const scaled = read("src/components/displays/DisplayViewerScaledCanvas.tsx");
  assert.match(scaled, /Viewport: \{measurements\.viewportWidth\}/);
  assert.match(scaled, /displayViewerDebug/);
  assert.match(scaled, /showViewportDiagnostics/);
});

test("project shell avoids h-full height feedback into pinned band", () => {
  const frame = read("src/components/projects/ProjectLayoutFrame.tsx");
  assert.doesNotMatch(frame, /project-layout-root[^"]*h-full/);
  const area = read("src/components/displays/PinnedDisplayViewerArea.tsx");
  assert.match(area, /normalizePinnedViewerHeight/);
  assert.match(area, /data-pinned-viewer-content/);
});
