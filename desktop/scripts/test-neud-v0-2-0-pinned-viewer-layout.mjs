import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("pinned band uses explicit viewerHeightPx containment (not content-driven height)", () => {
  const area = read("src/components/displays/PinnedDisplayViewerArea.tsx");
  assert.match(area, /data-pinned-viewer-band/);
  assert.match(area, /data-pinned-viewer-height=\{effectiveViewerHeightPx\}/);
  assert.match(area, /contentHeightStyle/);
  assert.match(area, /normalizePinnedViewerHeight/);
  assert.match(area, /overflow-hidden/);
  assert.match(area, /flex:\s*"0 0 auto"/);
  assert.match(area, /data-pinned-viewer-content/);
  assert.doesNotMatch(area, /contain:\s*"layout paint size"/);
  assert.doesNotMatch(area, /position:\s*['"]fixed|fixed inset|100vh|h-screen/i);
  const frame = read("src/components/projects/ProjectLayoutFrame.tsx");
  assert.doesNotMatch(frame, /project-layout-root[^"]*h-full/);
});

test("pinned preview uses standard display preview path (no fitToContainer in shared preview)", () => {
  const slot = read("src/components/displays/PinnedDisplayLiveSlot.tsx");
  assert.match(slot, /data-pinned-preview-region/);
  assert.match(slot, /data-pinned-preview-wrapper/);
  assert.match(slot, /showSizeLabel=\{false\}/);
  assert.doesNotMatch(slot, /fitToContainer|scaleToFill/);
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");
  assert.doesNotMatch(canvas, /fitToContainer|scaleToFill|containInBand/);
  assert.match(canvas, /aspectRatio/);
  const broad = read("src/components/displays/broad-arrow/BroadArrowDisplayCanvas.tsx");
  assert.doesNotMatch(broad, /fitToContainer|scaleToFill|containInBand/);
  assert.match(read("src/lib/displays/pinned-viewer-layout-diagnostics.ts"), /firstPinnedLayoutFailureStage/);
});

test("pinned viewer grid cells cannot expand band via min-content height", () => {
  const area = read("src/components/displays/PinnedDisplayViewerArea.tsx");
  assert.match(area, /\[&>\*\]:min-h-0/);
  assert.match(area, /grid h-full min-h-0/);
  const slot = read("src/components/displays/PinnedDisplayLiveSlot.tsx");
  assert.match(slot, /data-pinned-slot/);
  assert.match(slot, /pointerEvents:\s*"none"/);
  assert.match(slot, /shrink-0 truncate/);
});

test("browser layout containment when NEUD_RUN_BROWSER_TESTS=1", async () => {
  if (process.env.NEUD_RUN_BROWSER_TESTS !== "1") {
    return;
  }
  const puppeteerPath = path.join(
    root,
    "workers",
    "data-engine",
    "node_modules",
    "puppeteer",
    "lib",
    "esm",
    "puppeteer",
    "puppeteer.js",
  );
  if (!fs.existsSync(puppeteerPath)) {
    throw new Error("Puppeteer not found in workers/data-engine.");
  }
  const baseUrl = process.env.NEUD_PINNED_VIEWER_TEST_URL ?? "http://127.0.0.1:3000";
  const projectSlug = process.env.NEUD_PINNED_VIEWER_TEST_SLUG ?? "broad-arrow-auctions";
  const configuredHeight = Number(process.env.NEUD_PINNED_VIEWER_TEST_HEIGHT_PX ?? "220");
  const puppeteer = await import(pathToFileURL(puppeteerPath).href);
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${baseUrl}/projects/${projectSlug}/displays`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const authGate = await page.evaluate(() => ({
    href: window.location.href,
    hasAppShell: Boolean(document.querySelector(".app-shell")),
    isLoginSurface: Boolean(
      document.querySelector("input[type='password']") ||
        document.querySelector("form[action*='login']"),
    ),
  }));
  if (!authGate.hasAppShell || authGate.isLoginSurface) {
    await browser.close();
    console.warn(
      "Skipped pinned viewer browser layout test: authenticated project session required (redirected to login).",
    );
    return;
  }
  const layout = await page.evaluate((expectedBandHeight) => {
    function parseScale(transform) {
      if (!transform || transform === "none") return 1;
      const matrix = transform.match(/matrix\(([^)]+)\)/);
      if (matrix) {
        const first = Number.parseFloat(matrix[1].split(",")[0]?.trim() ?? "");
        return Number.isFinite(first) ? first : null;
      }
      return null;
    }

    const sidebar = document.querySelector(".app-shell aside");
    const bandInner = document.querySelector("[data-pinned-viewer-height]");
    const topMenu = document.querySelector(".project-layout-root")?.querySelector("nav");
    const projectFrame = document.querySelector(".project-layout-frame");
    const titleBar = document.querySelector("[data-desktop-shell]");
    const sidebarBox =
      sidebar instanceof HTMLElement ? sidebar.getBoundingClientRect() : null;
    const bandBox = bandInner instanceof HTMLElement ? bandInner.getBoundingClientRect() : null;
    const menuBox = topMenu instanceof HTMLElement ? topMenu.getBoundingClientRect() : null;
    const contentBox =
      projectFrame instanceof HTMLElement ? projectFrame.getBoundingClientRect() : null;
    const iframe = bandInner?.querySelector("iframe");
    const iframeBox = iframe instanceof HTMLElement ? iframe.getBoundingClientRect() : null;
    const iframeScale =
      iframe instanceof HTMLElement ? parseScale(getComputedStyle(iframe).transform) : null;
    const bandHeightAttr = bandInner?.getAttribute("data-pinned-viewer-height");
    const pinCount = bandInner?.querySelectorAll("[data-pinned-slot]").length ?? 0;
    const tolerance = 32;

    const sidebarPoint = sidebarBox
      ? document.elementFromPoint(
          Math.min(window.innerWidth - 8, sidebarBox.left + sidebarBox.width / 2),
          sidebarBox.top + Math.min(80, sidebarBox.height / 2),
        )
      : null;
    const pagePoint = contentBox
      ? document.elementFromPoint(
          contentBox.left + Math.min(120, contentBox.width / 2),
          contentBox.top + Math.min(80, contentBox.height / 2),
        )
      : null;

    const sidebarHit =
      sidebarPoint instanceof HTMLElement &&
      (sidebarPoint.closest(".app-shell aside") != null ||
        sidebarPoint.closest("nav") != null);
    const pageHit =
      pagePoint instanceof HTMLElement &&
      (pagePoint.closest(".project-layout-frame") != null ||
        pagePoint.closest("main") != null);

    const bandOk =
      !bandInner ||
      (bandBox &&
        Math.abs(bandBox.height - expectedBandHeight) <= tolerance &&
        bandHeightAttr === String(expectedBandHeight));
    const sidebarVisible = sidebarBox && sidebarBox.width > 40 && sidebarBox.height > 100;
    const menuVisible = !menuBox || (menuBox.height > 20 && menuBox.width > 200);
    const contentVisible = contentBox && contentBox.height > 80;
    const iframeContained =
      !iframeBox ||
      !bandBox ||
      (iframeBox.width <= bandBox.width + tolerance &&
        iframeBox.height <= bandBox.height + tolerance &&
        iframeBox.top >= bandBox.top - 2 &&
        iframeBox.bottom <= bandBox.bottom + tolerance);
    const iframeNotViewportSized =
      !iframeBox ||
      (iframeBox.width < window.innerWidth * 0.85 && iframeBox.height < window.innerHeight * 0.85);
    const scaleSane = iframeScale == null || (iframeScale > 0 && iframeScale <= 1.05);
    const fullDisplayVisible =
      !iframeBox ||
      !bandBox ||
      (iframeBox.width >= bandBox.width * 0.25 && iframeBox.height >= bandBox.height * 0.25);

    return {
      sidebarVisible,
      menuVisible,
      contentVisible,
      bandOk,
      iframeContained,
      iframeNotViewportSized,
      scaleSane,
      iframeScale,
      fullDisplayVisible,
      sidebarHit,
      pageHit,
      pinCount,
      bandHeight: bandBox?.height ?? null,
      iframeSize: iframeBox ? { w: iframeBox.width, h: iframeBox.height } : null,
      hasBand: Boolean(bandInner),
      hasTitleBar: Boolean(titleBar),
    };
  }, configuredHeight);

  assert.ok(layout.sidebarVisible, "sidebar should remain visible");
  assert.ok(layout.menuVisible, "horizontal project menu should remain visible");
  assert.ok(layout.contentVisible, "project content region should remain visible");
  assert.ok(layout.sidebarHit, "elementFromPoint over sidebar should hit sidebar/nav");
  assert.ok(layout.pageHit, "elementFromPoint over page should hit project content");
  if (layout.hasBand) {
    assert.ok(layout.bandOk, `pinned band height should match configured height (${configuredHeight})`);
    assert.ok(layout.iframeContained, "iframe must stay inside pinned band");
    assert.ok(layout.iframeNotViewportSized, "iframe must not cover the viewport");
    assert.ok(layout.scaleSane, "iframe transform scale must be sane (<= 1.05)");
    assert.ok(layout.fullDisplayVisible, "stream bid preview should fill a reasonable portion of band");
    assert.ok(layout.pinCount >= 1, "expected at least one pinned slot when band is present");
  }
  await browser.close();
});
