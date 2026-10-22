#!/usr/bin/env node
/**
 * Pass 11 hotfix: PinnedDisplayViewerArea must not touch window during SSR.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("PinnedDisplayViewerArea does not call window/getBoundingClientRect during render body", () => {
  const area = read("src/components/displays/PinnedDisplayViewerArea.tsx");
  assert.match(area, /useLayoutEffect/);
  assert.match(area, /measurePinnedLayoutAnchor/);
  assert.match(area, /setAnchorHeightPx/);
  assert.match(area, /resolvePinnedMaxHeightPx/);
  assert.match(area, /resolvePinnedEffectiveHeightPx/);
  assert.match(area, /SSR_CONTENT_WIDTH_PX/);
  assert.doesNotMatch(
    area,
    /anchor\?\.getBoundingClientRect\(\)\.height\s*\?\?\s*window\.innerHeight/,
  );
  assert.doesNotMatch(area, /const maxContentHeightPx\s*=\s*\(\)\s*=>/);
  const renderSection = area.split("useLayoutEffect")[0] ?? area;
  assert.doesNotMatch(renderSection, /window\.innerHeight/);
  assert.doesNotMatch(renderSection, /getBoundingClientRect/);
});

test("pure helpers: SSR fallback + 1/2/3/4 pin max + custom height clamp/preserve", async () => {
  const mod = await import(
    pathToFileURL(path.join(repoRoot, "shared/displays/pinned-viewer-preference.ts")).href
  );

  const titleRow = 18;
  const verticalPadding = 12;
  const gap = 8;
  function contentFit(pinCount, contentWidthPx = 800) {
    const columns = Math.max(1, Math.min(4, pinCount));
    const columnWidth = (contentWidthPx - gap * (columns - 1)) / columns;
    return Math.ceil(columnWidth * (2160 / 3840) + titleRow + verticalPadding);
  }

  assert.equal(mod.computePinnedAnchorMaxHeightPx(null), mod.PINNED_ANCHOR_MAX_HEIGHT_SSR_FALLBACK_PX);
  assert.equal(mod.computePinnedAnchorMaxHeightPx(undefined), mod.PINNED_ANCHOR_MAX_HEIGHT_SSR_FALLBACK_PX);
  assert.equal(mod.PINNED_ANCHOR_MAX_HEIGHT_SSR_FALLBACK_PX, mod.MAX_PINNED_VIEWER_HEIGHT_PX);
  assert.equal(mod.computePinnedAnchorMaxHeightPx(1000), 500);
  assert.equal(mod.computePinnedAnchorMaxHeightPx(2000), mod.MAX_PINNED_VIEWER_HEIGHT_PX);

  const fit1 = contentFit(1);
  const fit2 = contentFit(2);
  const fit3 = contentFit(3);
  const fit4 = contentFit(4);
  assert.ok(fit1 > fit2 && fit2 > fit3 && fit3 > fit4, "more pins → shorter content-fit max");

  const max1 = mod.resolvePinnedMaxHeightPx({ contentFitHeightPx: fit1, anchorHeightPx: 1000 });
  const max4 = mod.resolvePinnedMaxHeightPx({ contentFitHeightPx: fit4, anchorHeightPx: 1000 });
  assert.equal(max1, Math.min(Math.max(mod.MIN_PINNED_VIEWER_HEIGHT_PX, fit1), 500));
  assert.equal(max4, Math.min(Math.max(mod.MIN_PINNED_VIEWER_HEIGHT_PX, fit4), 500));
  assert.ok(max4 >= mod.MIN_PINNED_VIEWER_HEIGHT_PX);

  assert.equal(
    mod.resolvePinnedEffectiveHeightPx({
      storedHeightPx: mod.DEFAULT_PINNED_VIEWER_HEIGHT_PX,
      maxPinnedHeightPx: 400,
    }),
    400,
  );
  assert.equal(
    mod.resolvePinnedEffectiveHeightPx({
      storedHeightPx: 240,
      maxPinnedHeightPx: 400,
    }),
    240,
  );
  assert.equal(
    mod.resolvePinnedEffectiveHeightPx({
      storedHeightPx: 600,
      maxPinnedHeightPx: 400,
    }),
    400,
  );

  const maxAfterResize = mod.resolvePinnedMaxHeightPx({
    contentFitHeightPx: fit1,
    anchorHeightPx: 1600,
  });
  assert.equal(
    mod.resolvePinnedEffectiveHeightPx({
      storedHeightPx: 600,
      maxPinnedHeightPx: maxAfterResize,
    }),
    Math.min(600, maxAfterResize),
  );
});

test("SSR render path: helpers + simulated component math without window", async () => {
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(typeof globalThis.document, "undefined");

  const mod = await import(
    pathToFileURL(path.join(repoRoot, "shared/displays/pinned-viewer-preference.ts")).href
  );

  const contentFitHeightPx = Math.ceil(800 * (9 / 16) + 18 + 12);
  const maxPinnedHeightPx = mod.resolvePinnedMaxHeightPx({
    contentFitHeightPx,
    anchorHeightPx: null,
  });
  const effective = mod.resolvePinnedEffectiveHeightPx({
    storedHeightPx: mod.DEFAULT_PINNED_VIEWER_HEIGHT_PX,
    maxPinnedHeightPx,
    dragHeightPx: null,
    viewportHeightPx: null,
  });
  assert.ok(Number.isFinite(maxPinnedHeightPx) && maxPinnedHeightPx > 0);
  assert.ok(Number.isFinite(effective) && effective > 0);
  assert.equal(effective, maxPinnedHeightPx);
});

test("hydration-safe: SSR and first-client defaults share deterministic max path", async () => {
  const mod = await import(
    pathToFileURL(path.join(repoRoot, "shared/displays/pinned-viewer-preference.ts")).href
  );
  const area = read("src/components/displays/PinnedDisplayViewerArea.tsx");
  assert.match(area, /useState\(0\)/);
  assert.match(area, /useState<number \| null>\(null\)/);
  const a = mod.resolvePinnedMaxHeightPx({ contentFitHeightPx: 480, anchorHeightPx: null });
  const b = mod.resolvePinnedMaxHeightPx({ contentFitHeightPx: 480, anchorHeightPx: null });
  assert.equal(a, b);
  assert.equal(a, Math.min(480, mod.PINNED_ANCHOR_MAX_HEIGHT_SSR_FALLBACK_PX));
});

test("content-height module re-exports SSR-safe resolvers", () => {
  const height = read("src/lib/displays/pinned-viewer-content-height.ts");
  assert.match(height, /pinned-viewer-preference/);
  assert.match(height, /resolvePinnedMaxHeightPx/);
  assert.match(height, /resolvePinnedEffectiveHeightPx/);
  assert.match(height, /computePinnedAnchorMaxHeightPx/);
});
