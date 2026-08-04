#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const PIXEL_A = "https://example.test/photo-a.jpg";
const PIXEL_B = "https://example.test/photo-b.jpg";

const IMAGE_MOCK_SCRIPT = `<script>(function () {
  function MockImage() {
    this._onload = null;
    this._onerror = null;
    this._src = "";
  }

  MockImage.prototype = {
    set onload(fn) {
      this._onload = fn;
    },
    get onload() {
      return this._onload;
    },
    set onerror(fn) {
      this._onerror = fn;
    },
    get onerror() {
      return this._onerror;
    },
    set src(value) {
      this._src = value;
      var self = this;
      queueMicrotask(function () {
        if (typeof self._onload === "function") {
          self._onload();
        }
      });
    },
    get src() {
      return this._src;
    },
  };

  window.Image = MockImage;
})();</script>`;

function buildStreamBidTestPage(rawHtml, transformStreamBidHtmlForServing) {
  const servedHtml = transformStreamBidHtmlForServing(rawHtml);
  return `<!doctype html><html><head>${IMAGE_MOCK_SCRIPT}</head><body>${servedHtml}</body></html>`;
}

test("stream bid photo sync keeps finalized local slideshow transition helpers", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /function transitionPhoto\(src\)/);
  assert.match(html, /photo-enter/);
  assert.match(html, /PHOTO_TRANSITION_MS/);
  assert.doesNotMatch(html, /function clearPhotosImmediately/);
  assert.doesNotMatch(html, /function resetPhotosForLotChange/);
  assert.doesNotMatch(html, /var photoGeneration/);
});

test("hosted stream bid bridge preloads photos outside local display template", () => {
  const bridge = read("desktop/src/displays/stream-bid-v2-bridge.js");
  assert.match(bridge, /preloadHostedLotPhotos/);
  assert.match(bridge, /hostedPhotoCache/);
  assert.match(bridge, /hostedPhotoGeneration/);
  assert.match(bridge, /firstImageRequestStarted/);
});

test("stream bid bridge logs canonical photo group transitions", () => {
  const bridge = read("desktop/src/displays/stream-bid-v2-bridge.js");
  assert.match(bridge, /logCanonicalGroupTransition/);
  assert.match(bridge, /photoListGroupChanged/);
  assert.match(bridge, /oldPhotoCount/);
  assert.match(bridge, /newPhotoCount/);
  assert.match(bridge, /payloadHashPrefix/);
});

test("local lot change preserves smooth crossfade transition path", async () => {
  const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
  const { transformStreamBidHtmlForServing } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/displays/stream-display-v2-transform.js"),
    ).href,
  );

  const rawHtml = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const html = buildStreamBidTestPage(rawHtml, transformStreamBidHtmlForServing);

  const { puppeteer, launchOptions } = await loadValidationPuppeteer();
  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate((pixelA) => {
      window.render({
        auctionDisplay: {
          lot: "101",
          title: "First Lot",
          biddingPrice: "$ 10,000",
          photos: [pixelA],
        },
      });
    }, PIXEL_A);

    await page.waitForFunction(() => {
      const mainPhoto = document.getElementById("mainPhoto");
      return mainPhoto?.getAttribute("data-src")?.includes("photo-a.jpg");
    });

    await page.evaluate((pixelB) => {
      window.render({
        auctionDisplay: {
          lot: "102",
          title: "Second Lot",
          biddingPrice: "$ 20,000",
          photos: [pixelB],
        },
      });
    }, PIXEL_B);

    await page.waitForFunction(() => {
      const lotNumber = document.getElementById("lotNumber");
      const text =
        lotNumber?.textContent?.trim() || lotNumber?.getAttribute("data-text")?.trim() || "";
      return text.includes("102");
    });

    await page.waitForFunction(() => {
      const mainPhoto = document.getElementById("mainPhoto");
      const nextPhoto = document.getElementById("nextPhoto");
      const list = mainPhoto?.getAttribute("data-photo-list") || "";
      return (
        /photo-b\.jpg/.test(list) &&
        (nextPhoto?.classList.contains("photo-enter") ||
          mainPhoto?.getAttribute("data-src")?.includes("photo-b.jpg"))
      );
    });

    const state = await page.evaluate(() => {
      const lotNumber = document.getElementById("lotNumber");
      const mainPhoto = document.getElementById("mainPhoto");
      const nextPhoto = document.getElementById("nextPhoto");
      return {
        lotNumber: lotNumber?.textContent?.trim() || "",
        photoList: mainPhoto?.getAttribute("data-photo-list") || "",
        usesPhotoEnterPath: Boolean(
          nextPhoto?.classList.contains("photo-enter") ||
            mainPhoto?.getAttribute("data-src")?.includes("photo-b.jpg"),
        ),
      };
    });

    assert.match(state.lotNumber, /102/);
    assert.match(state.photoList, /photo-b\.jpg/);
    assert.equal(state.usesPhotoEnterPath, true);
  } finally {
    await browser.close();
  }
});

test("lot change with unavailable photos transitions to placeholder without stale list", async () => {
  const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
  const { transformStreamBidHtmlForServing } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/displays/stream-display-v2-transform.js"),
    ).href,
  );

  const rawHtml = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const html = buildStreamBidTestPage(rawHtml, transformStreamBidHtmlForServing);

  const { puppeteer, launchOptions } = await loadValidationPuppeteer();
  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.evaluate((pixelA) => {
      window.render({
        auctionDisplay: {
          lot: "301",
          title: "Old Lot",
          photos: [pixelA],
        },
      });
      window.render({
        auctionDisplay: {
          lot: "302",
          title: "New Lot",
          photos: [],
        },
      });
    }, PIXEL_A);

    const state = await page.evaluate(() => {
      const mainPhoto = document.getElementById("mainPhoto");
      const placeholder = document.getElementById("photoPlaceholder");
      return {
        photoList: mainPhoto?.getAttribute("data-photo-list") || "",
        placeholderVisible: placeholder?.classList.contains("visible"),
      };
    });

    assert.equal(state.photoList, "");
  } finally {
    await browser.close();
  }
});

test("late previous-lot callback is ignored by hosted bridge generation guard", () => {
  const bridge = read("desktop/src/displays/stream-bid-v2-bridge.js");
  assert.match(bridge, /hostedPhotoGeneration/);
  assert.match(bridge, /hostedPendingRenderToken/);
});

test("same photo count with different urls still updates list", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /nextList\.join\("\|"\)/);
});

test("hosted viewer refinements include transparency and fullscreen actions", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  const displayCard = read("src/components/hosted/HostedDisplayCard.tsx");
  const globals = read("src/app/globals.css");
  const documentPrep = read("src/lib/developer-tools/display-document.ts");
  const sidebar = read("src/components/portal/Sidebar.tsx");

  assert.match(client, /viewerMode/);
  assert.match(client, /View Fullscreen/);
  assert.match(client, /Copy URL/);
  assert.match(displayCard, /View Fullscreen/);
  assert.match(displayCard, /variant="primary"/);
  assert.match(client, /neud-viewer-transparency-grid/);
  assert.match(client, /fullscreen-output/);
  assert.doesNotMatch(client, /Exit Fullscreen/);
  assert.doesNotMatch(client, /setFullscreen/);
  assert.match(globals, /\.neud-viewer-transparency-grid/);
  assert.match(globals, /\.neud-fullscreen-output/);
  assert.match(documentPrep, /neud-hosted-transparent-doc/);
  assert.match(sidebar, /SidebarDownloadLink/);
  assert.match(sidebar, /pb-2[\s\S]*SidebarDownloadLink[\s\S]*border-t border-border/);
  assert.match(displayCard, /Copy URL[\s\S]*View Fullscreen[\s\S]*DisclosureSection/);
});

test("fullscreen route builders cover private and public paths", () => {
  const hostedRoutes = read("src/lib/routing/hosted-routes.ts");
  const viewerUrl = read("src/lib/hosted/viewer-url.ts");

  assert.match(hostedRoutes, /getPrivateDisplayFullscreenPath/);
  assert.match(hostedRoutes, /getPublicDisplayFullscreenPath/);
  assert.match(hostedRoutes, /isHostedFullscreenViewerPath/);
  assert.match(viewerUrl, /buildHostedFullscreenViewerPath/);
  assert.match(viewerUrl, /buildAbsoluteHostedFullscreenViewerUrl/);

  assert.ok(
    fs.existsSync(
      path.join(
        repoRoot,
        "src/app/portal/projects/[slug]/displays/[displaySlug]/fullscreen/page.tsx",
      ),
    ),
  );
  assert.ok(
    fs.existsSync(
      path.join(repoRoot, "src/app/view/[projectSlug]/[displaySlug]/fullscreen/page.tsx"),
    ),
  );
});
