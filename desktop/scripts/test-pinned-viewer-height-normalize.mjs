import assert from "node:assert/strict";
import test from "node:test";

test("normalizePinnedViewerHeight coerces invalid values to default", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-preference.ts");
  assert.equal(mod.normalizePinnedViewerHeight(null), 220);
  assert.equal(mod.normalizePinnedViewerHeight(undefined), 220);
  assert.equal(mod.normalizePinnedViewerHeight(0), 220);
  assert.equal(mod.normalizePinnedViewerHeight(-10), 220);
  assert.equal(mod.normalizePinnedViewerHeight(NaN), 220);
  assert.equal(mod.normalizePinnedViewerHeight("bad"), 220);
});

test("normalizePinnedViewerHeight preserves valid heights within clamp", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-preference.ts");
  assert.equal(mod.normalizePinnedViewerHeight(300), 300);
  assert.equal(mod.normalizePinnedViewerHeight(120), mod.MIN_PINNED_VIEWER_HEIGHT_PX);
  assert.equal(mod.normalizePinnedViewerHeight(9999), mod.MAX_PINNED_VIEWER_HEIGHT_PX);
});

test("merge normalizes invalid remote height before last-write-wins", async () => {
  const mod = await import("../../shared/displays/pinned-viewer-preference.ts");
  const merged = mod.mergePinnedViewerPreferenceByUpdatedAt(
    {
      updatedAt: "2020-01-01T00:00:00.000Z",
      pinnedDisplayIds: ["a"],
      viewerHeightPx: 240,
    },
    {
      updatedAt: "2030-01-01T00:00:00.000Z",
      pinnedDisplayIds: ["a"],
      viewerHeightPx: 0,
    },
  );
  assert.equal(merged.viewerHeightPx, 220);
});

test("pinned band layout separates content height from handle height", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const area = fs.readFileSync(
    path.join(root, "src/components/displays/PinnedDisplayViewerArea.tsx"),
    "utf8",
  );
  assert.match(area, /data-pinned-viewer-content/);
  assert.match(area, /RESIZE_HANDLE_HEIGHT_PX/);
  assert.doesNotMatch(area, /contain:\s*"layout paint size"/);
  assert.match(area, /minHeight: `\$\{effectiveViewerHeightPx \+ RESIZE_HANDLE_HEIGHT_PX\}px`/);
  assert.match(area, /normalizePinnedViewerHeight/);
});
