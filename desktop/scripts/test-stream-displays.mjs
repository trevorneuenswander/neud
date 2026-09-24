#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("stream display specs define bid and ticker slugs without renderer keys", () => {
  const specs = read("desktop/src/displays/broad-arrow-stream-display-specs.ts");
  assert.match(specs, /slug: "stream-bid-display"/);
  assert.match(specs, /slug: "stream-ticker"/);
  assert.match(specs, /name: "Stream Bid Display"/);
  assert.match(specs, /name: "Stream Ticker"/);
  assert.doesNotMatch(specs, /rendererKey/);
});

test("stream displays import service is idempotent and revision-aware", () => {
  const service = read("desktop/src/services/broad-arrow-stream-displays-import-service.ts");
  assert.match(service, /getBySlug\(projectId, spec\.slug\)/);
  assert.match(service, /hashBundledDisplayContentIdentity/);
  assert.match(service, /findByResourceAndSourceHash/);
  assert.match(service, /duplicateRevisionPrevented/);
  assert.match(service, /transformStreamBidHtmlForServing/);
  assert.match(service, /transformStreamTickerHtmlForServing/);
  assert.match(service, /buildStreamDisplayRevisionName/);
});

test("stream bid html uses transparent document background and pip cutout panels", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /background:\s*transparent/);
  assert.match(html, /white-field-composite/);
  assert.match(html, /stream-bid-pip-mask/);
  assert.match(html, /mask:\s*url\(#stream-bid-pip-mask\)/);
  assert.match(html, /\.pip-region[\s\S]*background:\s*transparent/);
  assert.doesNotMatch(html, /ticker-bar/);
  assert.doesNotMatch(html, /UP NEXT/);
  assert.match(html, /function render\(feed\)/);
  assert.match(html, /feed\.auctionDisplay/);
  assert.match(html, /STREAM_BID_BRIDGE/);
});

test("stream bid column uses deterministic layout and explicit typography", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /class="bid-column"/);
  assert.match(html, /class="lot-number bid-text"/);
  assert.match(html, /class="currency-code"/);
  assert.match(html, /class="currency-value"/);
  assert.match(html, /line-height:\s*1;/);
  assert.match(html, /--lot-to-reserve-gap:/);
  assert.match(html, /--currency-code-w:/);
  assert.match(html, /grid-template-columns: var\(--currency-code-w\)/);
  assert.doesNotMatch(html, /currency-label/);
  assert.doesNotMatch(html, /info-column/);
  assert.doesNotMatch(html, /min-height:\s*60px/);
  assert.match(html, /id="vehicleTitle" class="vehicle-title bid-text/);
  assert.match(html, /title-scroll-viewport/);
  assert.match(html, /title-scroll-track/);
  assert.match(html, /\.bid-text[\s\S]*margin:\s*0/);
});

test("stream ticker html keeps upper canvas transparent and limits to three lots", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  const bridge = read("desktop/src/displays/stream-ticker-v2-bridge.js");
  assert.match(html, /background:\s*transparent/);
  assert.match(html, /--ticker-bar-height:\s*240px/);
  assert.match(html, /stream-ticker-bar/);
  assert.match(html, /\/displays\/pylon\/logo\.png/);
  assert.match(html, /slot1/);
  assert.match(html, /slot2/);
  assert.match(html, /slot3/);
  assert.match(html, /MAX_UPCOMING_LOTS = 3/);
  assert.match(html, /\.slice\(0,\s*MAX_UPCOMING_LOTS\)/);
  assert.match(bridge, /\.slice\(0,\s*3\)/);
  assert.match(bridge, /NEUDDisplay\.subscribe/);
});

test("stream ticker layout uses equal-width grid lot regions", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(html, /--ticker-logo-panel-width:\s*960px/);
  assert.match(html, /\.logo-panel[\s\S]*left:\s*0/);
  assert.match(html, /--ticker-up-next-x:\s*calc\(var\(--ticker-logo-panel-width\) \+ var\(--ticker-logo-safe-inset\)\)/);
  assert.match(html, /--ticker-lot-regions-width:/);
  assert.match(html, /--ticker-lot-column-width:/);
  assert.match(html, /\.lot-regions[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(html, /\.lot-entry[\s\S]*min-width:\s*0/);
  assert.match(html, /#slot3/);
  assert.match(html, /object-fit:\s*contain/);
  assert.doesNotMatch(html, /has-separator/);
  assert.doesNotMatch(html, /#0087db[\s\S]*border-radius:\s*999px/);
});

test("stream ticker UP NEXT ends where the gray lot area begins", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(html, /--ticker-up-next-x:\s*calc\(var\(--ticker-logo-panel-width\) \+ var\(--ticker-logo-safe-inset\)\)/);
  assert.match(html, /--ticker-up-next-width:\s*calc\(var\(--ticker-lot-1-x\) - var\(--ticker-up-next-x\)\)/);
  assert.match(html, /--ticker-lot-group-left-offset:\s*235px/);
});

test("stream ticker design canvas is left-bottom anchored without centering inset", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(html, /html,\s*body[\s\S]*margin:\s*0/);
  assert.match(html, /html,\s*body[\s\S]*padding:\s*0/);
  assert.match(html, /\.display-stage[\s\S]*left:\s*0/);
  assert.match(html, /\.display-stage[\s\S]*bottom:\s*0/);
  assert.match(html, /\.display-stage[\s\S]*transform-origin:\s*left bottom/);
  assert.match(html, /stage\.style\.transform = "scale\(" \+ scale \+ "\)"/);
  assert.doesNotMatch(html, /offsetX/);
  assert.doesNotMatch(html, /innerWidth - CANVAS_W \* scale\) \/ 2/);
});

test("stream ticker removes far-left separator and centers UP NEXT label", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(html, /linear-gradient\([\s\S]*#000000 0[\s\S]*var\(--ticker-logo-panel-width\)/);
  assert.match(html, /\.up-next-label[\s\S]*width:\s*var\(--ticker-up-next-width\)/);
  assert.match(html, /\.up-next-label[\s\S]*align-items:\s*center/);
  assert.match(html, /\.up-next-label[\s\S]*justify-content:\s*center/);
  assert.match(html, /\.up-next-label[\s\S]*text-align:\s*center/);
  assert.match(html, /\.logo-panel img[\s\S]*border:\s*0/);
  assert.doesNotMatch(html, /border-left:\s*[^0]/);
  assert.match(html, /\.stream-ticker-bar[\s\S]*box-shadow:\s*none/);
});

test("stream ticker reuses legacy ticker lot animation and marquee behavior", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  const legacy = read(
    "desktop/src/displays/bundled/auction-ticker-legacy-live-v1-2026-07-26-132400.html",
  );
  const marquee = read("desktop/src/displays/legacy-ticker-marquee.js");
  assert.match(html, /function transitionSlot/);
  assert.match(html, /function freezeMarqueePosition/);
  assert.match(html, /startMarqueeStable/);
  assert.match(html, /layoutGeneration/);
  assert.match(html, /nearThresholdOverflow/);
  assert.match(html, /microAnimationPrevented/);
  assert.match(html, /dotSpacerLoopEnabled/);
  assert.match(html, /allScrollingSlotsHaveSpacer/);
  assert.match(html, /allScrollingSlotsHaveClone/);
  assert.match(html, /firstLoopFailureStage/);
  assert.match(html, /createLegacyTickerMarquee/);
  assert.match(html, /legacyTickerMarquee/);
  assert.match(html, /implementation: "legacy-ticker-shared"/);
  assert.match(html, /__streamTickerMarqueeDiagnostics/);
  assert.match(html, /shouldAbort/);
  assert.match(html, /hasActiveLoop/);
  assert.doesNotMatch(html, /var V = 52/);
  assert.doesNotMatch(html, /\.title-scroll\.is-static/);
  assert.doesNotMatch(html, /function measureSlotOverflow/);
  assert.doesNotMatch(html, /TRAIL_PAD/);
  assert.match(html, /function dissolveHideSlot/);
  assert.match(html, /title-scroll/);
  assert.match(html, /data-built/);
  assert.match(html, /FADE_MS = 250/);
  assert.match(html, /slide-in-right/);
  assert.match(html, /pill-dissolve/);
  assert.match(html, /\.lot-content/);
  assert.match(legacy, /function transitionTitle/);
  assert.match(marquee, /speedPxPerSecond != null \? config\.speedPxPerSecond : 40/);
  assert.match(marquee, /PAUSE_MS = config\.pauseMs != null \? config\.pauseMs : 4000/);
  assert.match(marquee, /overflowTolerancePx/);
  assert.match(marquee, /measureIntrinsicWidth/);
  assert.match(marquee, /startMarqueeStable/);
  assert.match(marquee, /measureStableTrack/);
  assert.match(marquee, /loopGap/);
  assert.match(marquee, /copyA/);
  assert.match(marquee, /class="gap"/);
  assert.match(marquee, /class="copyB"/);
  assert.match(marquee, /aria-hidden="true"/);
  assert.match(marquee, /loopCompletedCount/);
  assert.match(marquee, /primaryTitleWidth \+ spacerWidth/);
  assert.match(marquee, /seamlessResetConfirmed/);
  assert.doesNotMatch(marquee, /getBoundingClientRect/);
  assert.doesNotMatch(html, /function fitTitle/);
  assert.doesNotMatch(html, /text-overflow:\s*ellipsis/);
});

test("stream ticker html maps three upcoming lots with independent animation state", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(html, /MAX_UPCOMING_LOTS/);
  assert.match(html, /function buildLotKey/);
  assert.match(html, /incomingKey === slot\.activeLotKey/);
  assert.match(html, /function dissolveHideSlot/);
  assert.match(html, /createLegacyTickerMarquee/);
  assert.match(html, /function freezeMarqueePosition/);
  assert.match(html, /getComputedStyle\(inner\)\.transform/);
  assert.match(html, /inner\.classList\.add\("is-frozen"\)/);
  assert.match(html, /cancelLoop\(container\)/);
  assert.match(html, /transitionGeneration/);
});

test("stream ticker marquee freeze keeps exit animation on lot-content wrapper", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(html, /function beginContentExit/);
  assert.match(html, /function beginContentEntrance/);
  assert.match(html, /\.lot-content\.fade-out/);
  assert.match(html, /\.lot-content\.slide-in-right/);
  assert.match(html, /\.title-scroll \.inner\.is-frozen/);
  assert.doesNotMatch(html, /\.title-scroll\.fade-out/);
  assert.doesNotMatch(html, /\.title-scroll\.slide-in-right/);
  assert.match(html, /freezeMarqueePosition\(slot\.title\)/);
  assert.match(html, /writeSlotContent\(slot, lotText, titleText\)/);
  assert.match(html, /if \(generation !== slot\.transitionGeneration\)/);
  assert.match(html, /ensureSlotMarquee\(slot\)/);
});

test("stream bid bridge maps the same canonical fields as legacy pylon", () => {
  const bridge = read("desktop/src/displays/stream-bid-v2-bridge.js");
  assert.match(bridge, /buildAuctionDisplayView/);
  assert.match(bridge, /broadArrowDisplay\.pylon/);
  assert.match(bridge, /auctionDisplay/);
  assert.match(bridge, /current\.price/);
  assert.match(bridge, /currencies/);
  assert.match(bridge, /photos/);
  assert.match(bridge, /NEUD_DISPLAY_READY/);
});

test("stream bid transform injects runtime bridge at anchor", async () => {
  const { transformStreamBidHtmlForServing, isStreamBidRuntimeHtml } = await import(
    "../dist/displays/stream-display-v2-transform.js"
  );
  const base = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const served = transformStreamBidHtmlForServing(base, "/* bridge */");
  assert.match(served, /\/\* bridge \*\//);
  assert.doesNotMatch(served, /STREAM_BID_BRIDGE/);
  assert.equal(isStreamBidRuntimeHtml(served), true);
});

test("stream ticker transform injects legacy marquee helper and runtime bridge", async () => {
  const {
    transformStreamTickerHtmlForServing,
    isStreamTickerRuntimeHtml,
  } = await import("../dist/displays/stream-display-v2-transform.js");
  const base = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  const served = transformStreamTickerHtmlForServing(base, "/* bridge */");
  assert.match(served, /createLegacyTickerMarquee/);
  assert.match(served, /\/\* bridge \*\//);
  assert.doesNotMatch(served, /NEUD_LEGACY_TICKER_MARQUEE/);
  assert.doesNotMatch(served, /STREAM_TICKER_BRIDGE/);
  assert.equal(isStreamTickerRuntimeHtml(served), true);
});

test("stream ticker bridge renders three upcoming lots", () => {
  const bridge = read("desktop/src/displays/stream-ticker-v2-bridge.js");
  const placed = [];
  const sandbox = {
    placed,
    normalize(d) {
      if (!d) return { next: [] };
      return { next: (d.next || []).slice(0, 3) };
    },
    placeNextLots(next) {
      placed.push(next);
    },
    console,
    setInterval,
    clearInterval,
  };

  sandbox.window = {
    addEventListener() {},
    postMessage() {},
    location: { origin: "http://127.0.0.1:3000" },
    normalize: sandbox.normalize,
    placeNextLots: sandbox.placeNextLots,
    NEUDDisplay: {
      getSnapshot: () => ({
        broadArrowDisplay: {
          ticker: {
            next: [
              { lot: "101", title: "First" },
              { lot: "102", title: "Second" },
              { lot: "103", title: "Third" },
              { lot: "104", title: "Fourth" },
            ],
          },
        },
      }),
      subscribe(callback) {
        callback(this.getSnapshot());
      },
      signalReady() {},
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(bridge, sandbox);
  assert.ok(placed.length >= 1);
  const last = placed[placed.length - 1];
  assert.equal(last.length, 3);
  assert.equal(last[0].lot, "101");
  assert.equal(last[1].lot, "102");
  assert.equal(last[2].lot, "103");
});

test("desktop startup wires stream display import without touching legacy displays", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /BroadArrowStreamDisplaysImportService/);
  assert.match(main, /streamDisplaysImportResult/);
  assert.match(main, /BroadArrowLegacyDisplaysImportService/);
});

test("stream displays include title measurement helpers and bid value shrink-to-fit", () => {
  const bid = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(bid, /function measureTitlePresentation/);
  assert.match(bid, /function applyTitleLayout/);
  assert.match(bid, /title-measuring/);
  assert.match(bid, /title-measure/);
  assert.match(bid, /fitTextToWidth/);
  assert.match(bid, /object-fit:\s*cover/);
});

test("validation browser resolver checks repository and worker puppeteer paths", async () => {
  const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
  const runtime = await loadValidationPuppeteer();
  assert.ok(runtime.puppeteer, "expected puppeteer module");
  assert.ok(runtime.executablePath, "expected resolved Chrome executable");
  assert.ok(Array.isArray(runtime.checkedPaths) && runtime.checkedPaths.length >= 2);
  assert.ok(runtime.checkedPaths.some((entry) => entry.found === true));
  assert.ok(runtime.launchOptions.defaultViewport.width === 3840);
  assert.ok(runtime.launchOptions.defaultViewport.height === 2160);
});

test("stream bid geometry uses shared outer margin and exact 16:9 regions", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /--outer-margin:/);
  assert.match(html, /--main-top:\s*var\(--outer-margin\)/);
  assert.match(html, /--main-left:\s*var\(--outer-margin\)/);
  assert.match(html, /--column-gap:\s*var\(--outer-margin\)/);
  assert.match(html, /--main-h:\s*calc\(var\(--main-w\) \* 9 \/ 16\)/);
  assert.match(html, /--pip-h:\s*calc\(var\(--pip-w\) \* 9 \/ 16\)/);
  assert.match(html, /aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(html, /--main-w:\s*2743\.55px/);
  assert.match(html, /--pip-w:\s*882\.77px/);
  assert.match(html, /--title-top:/);
  assert.match(html, /--currency-code-gap: 28px/);
  assert.match(html, /--pip-radius:\s*50px/);
  assert.match(html, /white-field-fill/);
  assert.match(html, /syncPipMaskRect/);
});

test("stream bid right column gaps and title descender box are explicit", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /--lot-to-reserve-gap:/);
  assert.match(html, /--reserve-to-bid-gap:/);
  assert.match(html, /--bid-to-currencies-gap:/);
  assert.match(html, /--currency-row-gap:/);
  assert.match(html, /--title-line-height:/);
  assert.match(html, /--title-box-h:/);
  assert.match(html, /overflow:\s*visible/);
});

test("stream bid doubles currency row gap with one shared spacing variable", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /--currency-row-gap:\s*44px/);
  assert.match(html, /gap:\s*var\(--currency-row-gap\)/);
  assert.doesNotMatch(html, /--currency-row-gap:\s*22px/);
});

test("stream bid bid-group visibility reuses legacy pylon pill animation", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const legacy = read("desktop/src/displays/bundled/legacy-pylon-v1.html");
  assert.match(html, /\.primary-bid\.pill-hidden/);
  assert.match(html, /\.currency-row\.pill-hidden/);
  assert.match(html, /transform:\s*translateY\(-8px\)/);
  assert.match(html, /BID_PILL_HIDE_MS = 350/);
  assert.match(html, /BID_PILL_STAGGER_BASE_MS = 380/);
  assert.match(html, /BID_PILL_STAGGER_STEP_MS = 130/);
  assert.match(html, /function getBidPills/);
  assert.match(html, /function clearBidAnimation/);
  assert.match(html, /bidTransitionGeneration/);
  assert.match(html, /function renderBidSection/);
  assert.match(html, /function hasBidValue/);
  assert.match(legacy, /\.price-box\.pill-hidden/);
  assert.match(legacy, /380 \+ i \* 130/);
});

test("stream bid populated-to-blank and blank-to-populated use pylon bid transitions", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /setBidVisibility\(false\)/);
  assert.match(html, /beginBidEntranceFromState/);
  assert.match(html, /writeBidStateToDom/);
  assert.match(html, /applyBidEntranceInitialState/);
  assert.match(html, /scheduleBidEntranceStart/);
  assert.match(html, /is-enter-prep/);
  assert.match(html, /function ensureBidGroupSettled/);
  assert.match(html, /function isBidTransitionCurrent/);
  assert.match(html, /bidTransitionGeneration/);
  assert.doesNotMatch(html, /showBid \|\| hasCurrencies/);
});

test("stream bid formatted bids are not treated as blank and settle after duplicate render", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /function resolveBiddingPrice/);
  assert.match(html, /function hasBidValue/);
  assert.match(html, /ensureBidGroupSettled\(\)/);
  assert.match(html, /beginBidEntranceFromState/);
});

test("stream bid reserve status hides Has Reserve without collapsing row spacing", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /function formatReserveStatusForStreamBid/);
  assert.match(html, /layout: "placeholder"/);
  assert.match(html, /\.reserve-status\.placeholder/);
  assert.match(html, /Offered Without Reserve/);
  assert.match(html, /function buildHeaderState/);
  assert.match(html, /header-enter-prep/);
  assert.match(html, /__streamHeaderFrames/);
  assert.match(html, /function renderLotHeader/);
  assert.match(html, /renderLotHeader\(d\)/);
  assert.match(html, /prepHeaderElementsForIncomingWrite/);
  assert.match(html, /headerTransitionInProgress/);
  assert.match(html, /if \(headerTransitionInProgress\)/);
  assert.match(html, /visibility: hidden !important/);
  assert.doesNotMatch(html, /transitionText\(lotNumberEl, d\.lot/);
});

test("stream bid title uses rendered overflow check and 30 percent faster marquee", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const legacy = read("desktop/src/displays/bundled/legacy-pylon-v1.html");
  assert.match(html, /TITLE_OVERFLOW_TOLERANCE/);
  assert.match(html, /function measureTitleOverflow/);
  assert.match(html, /TITLE_MARQUEE_V = 52/);
  assert.doesNotMatch(html, /TITLE_SCROLL_CHARACTER_LIMIT/);
  assert.doesNotMatch(html, /TITLE_SCALE_CHARACTER_LIMIT/);
  assert.match(html, /TITLE_SIZE_MAX = 120/);
  assert.match(html, /TITLE_SIZE_MIN = 72/);
  assert.match(html, /scrollbar-width:\s*none/);
  assert.match(html, /::-webkit-scrollbar/);
  assert.match(html, /overflow-x:\s*hidden/);
  assert.match(html, /function ensureTitleTrack/);
  assert.match(html, /function startTitleMarquee/);
  assert.match(html, /originalAlignmentRestored:\s*true/);
  assert.match(html, /anchorOffset:\s*0/);
  assert.match(html, /fullTravelCompleted/);
  assert.doesNotMatch(html, /title-scroll-viewport\.title-static/);
  assert.doesNotMatch(html, /title-static/);
  assert.doesNotMatch(html, /\.title-scroll-viewport[\s\S]*justify-content:\s*center/);
  assert.match(html, /__streamBidTitleMarqueeDiagnostics/);
  assert.match(html, /activeLotKey/);
  assert.match(html, /renderedBidState/);
  assert.match(html, /buildBidState/);
  assert.match(html, /beginBidEntranceFromState/);
  assert.match(html, /is-enter-prep/);
  assert.match(html, /__streamBidEntranceFrames/);
  assert.match(html, /bid-exit-fade/);
  assert.match(html, /__streamBidValidateEntrance/);
  assert.match(legacy, /const V = 40/);
  assert.match(legacy, /const PAUSE_MS = 4000/);
});

test("display preview paused polling message uses red error text only", () => {
  const preview = read("src/components/displays/DisplayPreviewPanel.tsx");
  assert.match(
    preview,
    /text-xs text-red-400">Polling paused\. Last rendered values remain visible\./,
  );
  assert.match(preview, /Display data is disconnected/);
  assert.doesNotMatch(
    preview,
    /text-muted">Polling paused\. Last rendered values remain visible\./,
  );
});

test("stream ticker exposes idempotent layout refresh hook without preview observers", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(html, /__neudRefreshStreamTickerLayout/);
  assert.match(html, /function refreshStreamTickerLayout/);
  assert.match(html, /suppressedRefreshCount/);
  assert.match(html, /destructiveRefreshCount/);
  assert.match(html, /layoutRefreshCount/);
  assert.doesNotMatch(html, /ResizeObserver/);
  assert.doesNotMatch(html, /setupLayoutObservers/);
  assert.doesNotMatch(html, /scheduleDebouncedLayoutRefresh/);
  assert.doesNotMatch(html, /document_init/);
  assert.match(html, /function remeasureAllMarquees/);
  assert.match(html, /window\.addEventListener\("resize"/);
  assert.doesNotMatch(html, /preview-specific/i);
});

test("hosted viewer defers embedded preview payload and sends one layout refresh", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  const bridge = read("src/lib/hosted/hosted-display-runtime-bridge.ts");
  const inbound = read("shared/display-runtime/browser/hosted-bridge-inbound.js");
  assert.match(client, /buildNeudLayoutRefreshMessage/);
  assert.match(client, /postLayoutRefreshToIframe/);
  assert.match(client, /previewLayoutReadyRef/);
  assert.match(client, /oneTimeLayoutRefreshSentRef/);
  assert.match(client, /notifyEmbeddedLayoutReady/);
  assert.match(client, /initialPayloadDeferred/);
  assert.match(client, /oneTimeLayoutReadySent/);
  assert.doesNotMatch(client, /scheduleLayoutRefreshBurst/);
  assert.match(client, /__NEUD_VIEWER_MODE__/);
  assert.match(client, /key=\{bundle\?\.revisionKey/);
  assert.doesNotMatch(client, /key=\{.*canonicalRevision/);
  assert.match(bridge, /NEUD_LAYOUT_REFRESH/);
  assert.match(inbound, /__neudRefreshStreamTickerLayout/);
});

test("desktop preview defers stream ticker layout refresh until preview container is ready", () => {
  const canvas = read("src/components/displays/DisplayCanvasPreview.tsx");
  const panel = read("src/components/displays/DisplayPreviewPanel.tsx");
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  const layout = read("src/lib/displays/desktop-preview-stream-ticker-layout.ts");
  const templates = read("desktop/src/developer-tools/templates.ts");
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(canvas, /enableStreamTickerLayoutRefresh/);
  assert.match(canvas, /oneTimeLayoutRefreshSentRef/);
  assert.match(canvas, /trySendStreamTickerLayoutRefresh/);
  assert.match(canvas, /publishDesktopPreviewDiagnostics/);
  assert.match(canvas, /notifyPreviewLayoutReady/);
  assert.doesNotMatch(canvas, /scheduleLayoutRefreshBurst/);
  assert.match(panel, /enableStreamTickerLayoutRefresh/);
  assert.match(card, /display\.slug === "stream-ticker"/);
  assert.match(layout, /trySendStreamTickerLayoutRefresh/);
  assert.match(templates, /buildDesktopPreviewModeScript/);
  assert.match(templates, /previewMode/);
  assert.match(service, /previewMode/);
});

test("stream ticker diagnostics include desktop preview viewport fields", () => {
  const html = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(html, /iframeViewportWidth/);
  assert.match(html, /iframeViewportHeight/);
  assert.match(html, /refreshCount/);
  assert.match(html, /layoutReady/);
});

test("desktop preview iframe key uses published revision not canonical revision", () => {
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /previewIframeKey = display\.publishedRevisionId/);
  assert.doesNotMatch(card, /canonicalRevision/);
});

test("stream ticker source remains unchanged", () => {
  const ticker = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.match(ticker, /stream-ticker-bar/);
  assert.match(ticker, /logo-panel/);
  assert.match(ticker, /window\.placeNextLots/);
  assert.match(ticker, /function normalize/);
  assert.doesNotMatch(ticker, /pill-hidden/);
  assert.doesNotMatch(ticker, /renderBidSection/);
});

test(
  "stream ticker preview layout refresh recovers from zero-width initialization",
  { timeout: 180000 },
  async () => {
    const { validateStreamTickerPreviewLayoutRefresh, buildBareTickerFixtureHtml } = await import(
      "./validate-stream-displays-screenshots.mjs"
    );
    const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");

    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-ticker-preview-layout-"));
    const fixturePath = path.join(fixtureDir, "stream-ticker-preview-layout-fixture.html");
    fs.writeFileSync(fixturePath, buildBareTickerFixtureHtml(), "utf8");

    const runtime = await loadValidationPuppeteer();
    const browser = await runtime.puppeteer.launch(runtime.launchOptions);
    let result;
    try {
      result = await validateStreamTickerPreviewLayoutRefresh(browser, fixturePath);
    } finally {
      await browser.close();
    }

    assert.equal(result.expandedDiagnostics?.implementation, "legacy-ticker-shared");
    assert.equal(result.expandedDiagnostics?.viewerMode, "portal-preview");
    assert.ok(
      result.expandedDiagnostics?.slots?.[0]?.viewportWidth > 0,
      "slot 1 viewport width is nonzero after expansion",
    );
    assert.equal(
      result.expandedDiagnostics?.equalSlotWidths,
      true,
      "equal slot widths remain after preview expansion",
    );
    assert.equal(
      result.expandedDiagnostics?.slots?.[2]?.shouldScroll,
      false,
      "short third title remains static in preview",
    );
    assert.equal(
      result.scrollingDiagnostics?.slots?.[0]?.shouldScroll,
      true,
      "long first title scrolls after preview expansion",
    );
    assert.equal(
      result.scrollingDiagnostics?.slots?.[1]?.shouldScroll,
      true,
      "long second title scrolls independently after preview expansion",
    );
    assert.ok(
      result.scrollingDiagnostics?.slots?.[0]?.animationRunning ||
        result.scrollingDiagnostics?.slots?.[0]?.fullTravelCompleted,
      "first overflowing slot has active or completed marquee after expansion",
    );
  },
);

test(
  "near-threshold stream ticker overflow avoids micro reset and matches on reload",
  { timeout: 180000 },
  async () => {
    const { validateNearThresholdOverflowMarquee } = await import(
      "./validate-stream-displays-screenshots.mjs"
    );
    const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");

    const runtime = await loadValidationPuppeteer();
    const browser = await runtime.puppeteer.launch(runtime.launchOptions);
    let result;
    try {
      result = await validateNearThresholdOverflowMarquee(browser);
    } finally {
      await browser.close();
    }

    assert.equal(result.fitsTrack.shouldScroll, false, "short title remains static");
    assert.ok(
      result.fitsTrack.overflowPx <= 2 || result.fitsTrack.shouldScroll === false,
      "fitting title stays within tolerance",
    );
    assert.ok(result.nearTrack.overflowPx > 0, "near-threshold fixture produces positive overflow");
    assert.ok(
      result.nearTrack.overflowPx <= 20,
      "near-threshold fixture overflow stays small",
    );
    assert.equal(result.nearTrack.shouldScroll, true, "near-threshold overflow should scroll");
    assert.ok(
      result.nearTrack.easeDistance <= result.nearTrack.totalTravelDistance / 2 + 0.01,
      "ease distance never exceeds half of total travel",
    );
    assert.ok(
      result.nearTrack.cruiseDistance >= 0,
      "cruise distance never becomes negative",
    );
    assert.ok(
      result.nearTrack.totalTravelDistance >= result.nearTrack.overflowPx,
      "total travel covers overflow distance",
    );
    assert.equal(result.afterFirstLoad?.shouldScroll, true, "first load starts scrolling");
    assert.equal(result.secondLoad?.shouldScroll, true, "second load remains scrollable");
    assert.ok(
      result.afterFirstLoad?.stableMeasurementUsed === true,
      "first load uses stable measurement",
    );
    assert.ok(
      Math.abs((result.afterFirstLoad?.overflowPx || 0) - (result.secondLoad?.overflowPx || 0)) <= 1,
      "first and second load agree on overflow width",
    );
    if (result.afterFirstLoad?.shouldScroll) {
      assert.ok(
        result.maxDistance > result.nearTrack.overflowPx * 0.5 ||
          result.afterFirstLoad?.fullTravelCompleted === true,
        "near-threshold scroll travels beyond a one-character micro nudge",
      );
    }
  },
);

test(
  "stream ticker dot-spacer loop builds clone track and repeats seamlessly",
  { timeout: 120000 },
  async () => {
    const { validateDotSpacerContinuousLoop, buildBareTickerFixtureHtml } = await import(
      "./validate-stream-displays-screenshots.mjs"
    );
    const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");

    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-ticker-dot-spacer-"));
    const fixturePath = path.join(fixtureDir, "stream-ticker-dot-spacer-fixture.html");
    fs.writeFileSync(fixturePath, buildBareTickerFixtureHtml(), "utf8");

    const runtime = await loadValidationPuppeteer();
    const browser = await runtime.puppeteer.launch(runtime.launchOptions);
    let result;
    try {
      result = await validateDotSpacerContinuousLoop(browser, fixturePath);
    } finally {
      await browser.close();
    }

    assert.equal(result.trackStructure.hasCopyA, true, "primary title copy is present");
    assert.equal(result.trackStructure.hasGap, true, "dot spacer is present");
    assert.equal(result.trackStructure.hasCopyB, true, "clone title copy is present");
    assert.match(result.trackStructure.gapText || "", /•/, "dot spacer uses bullet separator");
    assert.equal(result.trackStructure.gapAriaHidden, "true");
    assert.equal(result.trackStructure.copyBAriaHidden, "true");
    assert.equal(result.trackStructure.slot?.shouldScroll, true, "overflowing slot scrolls");
    assert.ok(
      (result.trackStructure.slot?.loopDistance || 0) > (result.trackStructure.slot?.overflowPx || 0),
      "loop distance exceeds overflow-only distance",
    );
    assert.ok(
      Math.abs(
        (result.trackStructure.slot?.loopDistance || 0) -
          ((result.trackStructure.slot?.primaryTitleWidth || 0) +
            (result.trackStructure.slot?.spacerWidth || 0)),
      ) <= 1,
      "loop distance equals primary title width plus spacer width",
    );
    assert.equal(result.trackStructure.dotSpacerLoopEnabled, true);
    assert.equal(result.trackStructure.allScrollingSlotsHaveSpacer, true);
    assert.equal(result.trackStructure.allScrollingSlotsHaveClone, true);
    assert.ok(
      (result.afterLoops.slot?.loopCompletedCount || 0) >= 1,
      "at least one seamless loop cycle completes",
    );
    assert.equal(result.afterLoops.slot?.shouldScroll, true, "slot remains in scroll mode");
    assert.ok(
      result.afterLoops.activeAnimationCount >= 1 || (result.afterLoops.slot?.loopCompletedCount || 0) >= 1,
      "loop animation continues after first reset",
    );
  },
);

test(
  "stream bid animation validation covers blank, enter, clear, and repeat states",
  { timeout: 180000 },
  async () => {
    const { validateBidAnimationSequence, captureStreamDisplayScreenshots } = await import(
      "./validate-stream-displays-screenshots.mjs"
    );
    const { manifest, runtime } = await captureStreamDisplayScreenshots();
    assert.ok(manifest.bidAnimation, "expected bid animation validation results");
    assert.ok(manifest.initialPopulated, "expected initial populated validation results");

    const initial = manifest.initialPopulated.afterBridgeLoad;
    assert.equal(initial.bidBlockCollapsed, false, "initial populated bid block visible after bridge load");
    assert.match(initial.bidText, /^\$44,000,000$/, "initial populated bid text visible");
    assert.equal(initial.currencyRowCount, 4, "initial populated currencies visible");
    assert.equal(initial.bidPillHidden, false, "initial populated bid not stuck pill-hidden");

    const initialPhases = manifest.initialPopulated.initialEntrancePhases || [];
    const initialPrep = initialPhases.find((phase) => phase.phase === "after-prep");
    if (initialPrep) {
      assert.equal(initialPrep.collapsed, true, "initial populated load writes bid while collapsed");
      assert.equal(initialPrep.allPillsHidden, true, "initial populated load prepares all pills hidden");
      assert.equal(initialPrep.primaryOpacity, "0", "initial populated load keeps bid opacity at zero during prep");
    }

    const settled = manifest.initialPopulated.afterDoubleRender;
    assert.equal(settled.bidBlockCollapsed, false, "duplicate populated render keeps bid visible");
    assert.match(settled.bidText, /^\$44,000,000$/, "duplicate populated render keeps bid text");
    assert.equal(settled.bidPillHidden, false, "duplicate populated render clears pill-hidden");

    const anim = manifest.bidAnimation;
    assert.equal(anim.initialBlank.bidBlockCollapsed, true, "initial blank bid block collapsed");
    assert.equal(anim.initialBlank.bidText, "", "initial blank bid text empty");
    assert.equal(anim.initialBlank.currencyRowCount, 0, "initial blank has no currency rows");
    assert.ok(anim.initialBlank.lotVisible, "lot remains visible when bid blank");
    assert.ok(anim.initialBlank.titleVisible, "title remains visible when bid blank");

    assert.equal(anim.firstBidVisible.bidBlockCollapsed, false, "bid block visible after first bid");
    assert.match(anim.firstBidVisible.bidText, /^\$44,000,000$/, "bid text has no symbol gap");
    assert.equal(anim.firstBidVisible.currencyRowCount, 4, "four currency rows after first bid");

    assert.equal(anim.bidClearing.bidPillHidden, true, "bid pill hidden during clear animation");
    assert.ok(
      anim.bidClearing.currencyRowsPillHidden.every(Boolean),
      "currency rows hidden during clear animation",
    );

    assert.equal(anim.bidCleared.bidBlockCollapsed, true, "bid block collapsed after clear");
    assert.equal(anim.bidCleared.bidText, "", "bid text cleared after animation");

    assert.equal(
      anim.repeatedBid.bidText,
      anim.firstBidVisible.bidText,
      "repeated identical bid keeps same text",
    );

    assert.equal(anim.bidReenteredVisible.currencyRowCount, 4, "bid re-entry shows currencies again");

    assert.equal(anim.rapidBlankToPopulatedSettled.bidBlockCollapsed, false, "rapid blank-to-populated stays visible");
    assert.match(
      anim.rapidBlankToPopulatedSettled.bidText,
      /^\$44,000,000$/,
      "rapid blank-to-populated keeps bid text",
    );
    assert.equal(
      anim.rapidBlankToPopulatedSettled.bidPillHidden,
      false,
      "stale exit callback does not leave bid pill-hidden",
    );

    assert.equal(anim.hasReserve.reserveText, "", "Has Reserve renders blank text");
    assert.equal(anim.hasReserve.reservePlaceholder, true, "Has Reserve keeps placeholder row");
    assert.ok(anim.hasReserve.reserveHeight >= 50, "Has Reserve preserves reserve row height");
    assert.ok(anim.hasReserve.lotToBidGap >= 48, "Has Reserve does not collapse lot-to-bid spacing");

    assert.match(
      anim.offeredWithoutReserve.reserveText,
      /Offered Without Reserve/,
      "Offered Without Reserve still renders",
    );

    if (anim.firstBidVisible.currencyRowGaps.length === 3) {
      const [gap1, gap2, gap3] = anim.firstBidVisible.currencyRowGaps;
      assert.equal(gap1, 44, "EUR to GBP gap doubled to 44px");
      assert.equal(gap2, 44, "GBP to CHF gap doubled to 44px");
      assert.equal(gap3, 44, "CHF to JPY gap doubled to 44px");
    }

    assert.ok(manifest.fixtures?.bidAnimation, "bid animation fixture path recorded");
    assert.ok(runtime.executablePath);
  },
);

test(
  "stream bid title validation covers scale, scroll, and hidden measurement",
  { timeout: 180000 },
  async () => {
    const { validateTitleSequence, captureStreamDisplayScreenshots } = await import(
      "./validate-stream-displays-screenshots.mjs"
    );
    const { manifest } = await captureStreamDisplayScreenshots();
    assert.ok(manifest.titlePresentation, "expected title presentation validation results");

    const titles = manifest.titlePresentation;
    assert.equal(titles.short.fontSize, 120, "short title stays at 120px");
    assert.equal(titles.short.scrollMode, false, "short title does not scroll");
    assert.equal(titles.short.hasLoopCopy, false, "short title has no loop copy");

    assert.ok(
      titles.mediumSettled.text.length < 50,
      "medium fixture stays below scroll-character threshold",
    );
    assert.ok(
      titles.mediumSettled.fontSize >= 72 && titles.mediumSettled.fontSize <= 120,
      "medium title uses final size within allowed range",
    );
    assert.equal(titles.mediumSettled.scrollMode, false, "medium title remains static when it fits");
    assert.equal(titles.mediumSettled.measuring, false, "medium title is revealed after measurement");

    assert.equal(titles.exactly50.text.length, 50, "exactly-50 fixture length");
    assert.ok(
      titles.exactly50.fontSize >= 72 && titles.exactly50.fontSize <= 120,
      "exactly-50 title uses rendered size within allowed range",
    );
    assert.equal(
      titles.exactly50.scrollMode,
      false,
      "exactly 50 digits remain static when rendered width fits viewport",
    );

    const visibleMediumFrames = titles.mediumFrames.filter((frame) => frame && !frame.measuring);
    if (titles.mediumSettled.fontSize < 120) {
      assert.ok(
        visibleMediumFrames.every((frame) => frame.fontSize <= titles.mediumSettled.fontSize),
        "medium title never flashes at 120px before its reduced size",
      );
    }

    assert.ok(
      titles.long.fontSize >= 72 && titles.long.fontSize <= 120,
      "very long title uses rendered size within allowed range",
    );
    assert.equal(titles.long.scrollMode, true, "very long title enters scrolling mode");
    assert.equal(titles.long.hasLoopCopy, true, "very long title uses legacy loop copies");
    assert.equal(titles.long.viewportOverflowX, "hidden", "horizontal clipping stays in viewport");
    assert.equal(titles.long.viewportScrollbarWidth, "none", "title viewport hides scrollbars");

    assert.equal(
      titles.longRepeated.text,
      titles.long.text,
      "repeated identical title keeps same text",
    );
    assert.equal(titles.longRepeated.scrollMode, true, "repeated identical title stays in scroll mode");

    assert.equal(titles.longNewLot.scrollMode, true, "lot change keeps scroll mode for long title");
    assert.ok(
      /translate3d\(0(?:px)?,\s*0(?:px)?,\s*0(?:px)?\)/.test(titles.longNewLot.trackTransform || ""),
      "lot change resets scroll transform",
    );

    assert.equal(titles.empty.text, "", "empty title clears text");
    assert.equal(titles.empty.scrollMode, false, "empty title does not scroll");
    assert.equal(titles.empty.hasLoopCopy, false, "empty title has no loop copies");
  },
);

test(
  "stream bid lot transitions fade blank next-lot bids and prevent stale values",
  { timeout: 180000 },
  async () => {
    const { validateBidLotSequence, buildBidFixtureHtml } = await import(
      "./validate-stream-displays-screenshots.mjs"
    );
    const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");

    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-bid-lot-"));
    const fixturePath = path.join(fixtureDir, "stream-bid-lot-fixture.html");
    fs.writeFileSync(fixturePath, buildBidFixtureHtml(), "utf8");

    const runtime = await loadValidationPuppeteer();
    const browser = await runtime.puppeteer.launch(runtime.launchOptions);
    let lot;
    try {
      lot = await validateBidLotSequence(browser, fixturePath);
    } finally {
      await browser.close();
    }

    assert.match(lot.lotAWithBid.bidText, /^\$44,000,000$/, "lot A starts with populated bid");
    assert.equal(lot.lotBFading.bidExitFade, true, "next blank lot uses opacity-only bid exit");
    assert.match(lot.lotBFading.bidText, /^\$44,000,000$/, "fade begins before text is cleared");
    assert.equal(lot.lotBCleared.bidBlockCollapsed, true, "blank lot clears bid block after fade");
    assert.equal(lot.lotBCleared.bidText, "", "blank lot clears bid text after fade");
    assert.equal(lot.lotBClearedLayers.bidText, "", "all bid layers cleared after fade");
    assert.equal(lot.lotBClearedLayers.dataBid, "", "bid data attribute cleared after fade");

    const staleFrame = lot.lotBEntranceFrames.find(
      (frame) => frame.bidText === "$44,000,000" || frame.dataBid === "$44,000,000",
    );
    assert.equal(staleFrame, undefined, "previous lot bid never appears after lot B is active");

    const preEntranceFrame =
      lot.lotBEntranceFrames.find((frame) => frame.delayMs === 0) || lot.lotBEntranceFrames[0];
    assert.match(
      preEntranceFrame.bidText,
      /^\$125,000$/,
      "first bid on new lot writes new value before entrance",
    );
    assert.match(
      lot.lotBFirstBidSettled.bidText,
      /^\$125,000$/,
      "new lot bid settles correctly",
    );
    assert.ok(
      lot.lotBFirstBidSettled.currencyValues.includes("109,375"),
      "new lot currency values match new bid",
    );

    assert.ok(
      lot.lotBEntranceFrames.some((frame) =>
        (frame.entranceChecks || []).some(
          (check) =>
            check.expectedLotKey === check.activeLotKey &&
            check.domBid === check.expectedBid &&
            check.expectedBid === "$125,000",
        ),
      ),
      "entrance validation hook confirms lot-scoped DOM before animation",
    );

    const afterDomWrite = lot.lotBEntrancePhases.find((phase) => phase.phase === "after-dom-write");
    const afterPrep = lot.lotBEntrancePhases.find((phase) => phase.phase === "after-prep");
    const beforeReveal = lot.lotBEntrancePhases.find((phase) => phase.phase === "before-reveal");
    assert.ok(afterDomWrite, "entrance captures frame after DOM write");
    assert.equal(afterDomWrite.collapsed, true, "bid group stays collapsed when values are first written");
    assert.match(afterDomWrite.domBid, /^\$125,000$/, "new bid values are written before reveal");
    assert.ok(afterPrep, "entrance captures prepared frame");
    assert.equal(afterPrep.isEnterPrep, true, "entrance preparation class applied before reveal");
    assert.equal(afterPrep.allPillsHidden, true, "all bid and currency pills hidden during prep");
    assert.equal(afterPrep.primaryOpacity, "0", "prepared bid opacity stays zero before entrance");
    assert.ok(beforeReveal, "entrance captures pre-reveal committed frame");
    assert.equal(beforeReveal.allPillsHidden, true, "pre-reveal frame keeps all pills hidden");

    const settledFlash = lot.lotBEntranceFrames.find(
      (frame) =>
        frame.delayMs <= 16 &&
        frame.primaryOpacity === "1" &&
        frame.allPillsHidden === false &&
        !frame.pillHidden[0],
    );
    assert.equal(settledFlash, undefined, "new bid never appears settled before entrance animation");

    assert.match(lot.rapidLotD.bidText, /^\$250,000$/, "rapid lot changes reveal only the latest lot bid");
    assert.match(
      lot.bidBeforeFadeCompletes.bidText,
      /^\$500,000$/,
      "bid arriving before fade completes still shows the new lot bid",
    );
  },
);

test(
  "stream ticker lot transition freezes marquee scroll position before exit",
  { timeout: 180000 },
  async () => {
    const { validateTickerMarqueeTransition, buildBareTickerFixtureHtml } = await import(
      "./validate-stream-displays-screenshots.mjs"
    );
    const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");

    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-ticker-marquee-"));
    const fixturePath = path.join(fixtureDir, "stream-ticker-marquee-fixture.html");
    fs.writeFileSync(fixturePath, buildBareTickerFixtureHtml(), "utf8");

    const runtime = await loadValidationPuppeteer();
    const browser = await runtime.puppeteer.launch(runtime.launchOptions);
    let ticker;
    try {
      ticker = await validateTickerMarqueeTransition(browser, fixturePath);
    } finally {
      await browser.close();
    }

    assert.ok(
      !/translate3d\(0(?:px)?,\s*0(?:px)?,\s*0(?:px)?\)/.test(ticker.midScroll.computedTransform) &&
        ticker.midScroll.computedTransform !== "none",
      "slot 1 marquee reaches a non-zero scroll position before lot change",
    );

    assert.equal(ticker.immediate.isFrozen, true, "outgoing marquee is frozen immediately on lot change");
    assert.equal(ticker.immediate.contentFadeOut, true, "lot exit runs on lot-content wrapper");
    assert.equal(
      ticker.immediate.dataTitle,
      ticker.longTitle,
      "outgoing title data is not rewritten before exit completes",
    );
    assert.match(ticker.immediate.lotText, /^Lot 102$/, "outgoing lot number remains until exit completes");
    assert.ok(
      !/translate3d\(0(?:px)?,\s*0(?:px)?,\s*0(?:px)?\)/.test(ticker.immediate.computedTransform) &&
        ticker.immediate.computedTransform !== "none",
      "outgoing marquee does not reset to zero when lot change starts",
    );
    assert.ok(
      !/translate3d\(0(?:px)?,\s*0(?:px)?,\s*0(?:px)?\)/.test(ticker.duringFade.computedTransform) &&
        ticker.duringFade.computedTransform !== "none",
      "outgoing marquee stays mid-scroll during fade-out",
    );
    assert.match(
      ticker.afterFade.dataTitle,
      /2001 Ferrari 550 Barchetta Pininfarina/,
      "incoming slot 1 title is written after outgoing fade completes",
    );
    assert.equal(ticker.afterEntrance.contentSlideIn, false, "incoming entrance animation completes");
    assert.equal(
      ticker.identicalPayload.dataTitle,
      ticker.afterEntrance.dataTitle,
      "identical payload does not rewrite slot 1 title",
    );
    assert.match(ticker.rapidAdvance.lotText, /^Lot 107$/, "rapid lot advances settle on latest lot number");
  },
);

test(
  "stream ticker left edge and three-slot layout fit inside 3840px canvas",
  { timeout: 180000 },
  async () => {
    const { validateTickerLayoutAndThreeSlots, buildTickerFixtureHtml } = await import(
      "./validate-stream-displays-screenshots.mjs"
    );
    const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");

    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-ticker-layout-"));
    const fixturePath = path.join(fixtureDir, "stream-ticker-layout-fixture.html");
    fs.writeFileSync(fixturePath, buildTickerFixtureHtml(), "utf8");

    const runtime = await loadValidationPuppeteer();
    const browser = await runtime.puppeteer.launch(runtime.launchOptions);
    let layout;
    try {
      layout = await validateTickerLayoutAndThreeSlots(browser, fixturePath);
    } finally {
      await browser.close();
    }

    assert.equal(layout.fullLayout.stageLeft, 0, "design canvas is flush with viewport left edge");
    assert.equal(layout.fullLayout.logoLeft, 0, "black logo panel begins at viewport X=0");
    assert.equal(layout.fullLayout.logoWidth, 960, "black logo panel remains 960px wide");
    assert.equal(layout.fullLayout.logoRightDesign, 960, "black panel ends at design X=960");

    assert.equal(layout.fullLayout.slots[0].hidden, false, "slot 1 is visible with three-lot payload");
    assert.equal(layout.fullLayout.slots[1].hidden, false, "slot 2 is visible with three-lot payload");
    assert.equal(layout.fullLayout.slots[2].hidden, false, "slot 3 is visible with three-lot payload");
    assert.match(layout.fullLayout.slots[0].lotText, /^Lot 101$/, "slot 1 maps to upcoming index 0");
    assert.match(layout.fullLayout.slots[1].lotText, /^Lot 102$/, "slot 2 maps to upcoming index 1");
    assert.match(layout.fullLayout.slots[2].lotText, /^Lot 103$/, "slot 3 maps to upcoming index 2");
    assert.equal(layout.fullLayout.slots[0].left, 1305, "slot 1 left coordinate");
    assert.ok(
      layout.fullLayout.slots.every((slot) => slot.width === layout.fullLayout.slots[0].width),
      "all three lot slots share equal width",
    );
    assert.equal(layout.fullLayout.slots[0].width, 833, "each lot slot width at 3840x2160");
    assert.equal(layout.fullLayout.slots[1].left, 2138, "slot 2 left coordinate");
    assert.equal(layout.fullLayout.slots[2].left, 2972, "slot 3 left coordinate");
    assert.ok(layout.fullLayout.slots[2].right <= 3840, "slot 3 fits inside 3840px canvas");

    assert.equal(layout.oneLot.slots[0].hidden, false, "single-lot payload shows slot 1");
    assert.equal(layout.oneLot.slots[1].hidden, true, "single-lot payload hides slot 2");
    assert.equal(layout.oneLot.slots[2].hidden, true, "single-lot payload hides slot 3");

    assert.equal(layout.twoLots.slots[0].hidden, false, "two-lot payload shows slot 1");
    assert.equal(layout.twoLots.slots[1].hidden, false, "two-lot payload shows slot 2");
    assert.equal(layout.twoLots.slots[2].hidden, true, "two-lot payload hides slot 3");
  },
);

test(
  "stream bid lot header reserve status stays synchronized with lot number on lot change",
  { timeout: 180000 },
  async () => {
    const { validateHeaderLotSequence, buildBidFixtureHtml } = await import(
      "./validate-stream-displays-screenshots.mjs"
    );
    const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");

    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "neud-header-lot-"));
    const fixturePath = path.join(fixtureDir, "stream-header-lot-fixture.html");
    fs.writeFileSync(fixturePath, buildBidFixtureHtml(), "utf8");

    const runtime = await loadValidationPuppeteer();
    const browser = await runtime.puppeteer.launch(runtime.launchOptions);
    let header;
    try {
      header = await validateHeaderLotSequence(browser, fixturePath);
    } finally {
      await browser.close();
    }

    assert.match(header.lot101Settled.lotText, /^Lot 101$/, "lot 101 settles with lot number");
    assert.match(
      header.lot101Settled.reserveText,
      /Offered Without Reserve/,
      "lot 101 settles with reserve text",
    );

    const lot102DomWrite = header.lot102Phases.find((phase) => phase.phase === "after-dom-write");
    const lot102Prep = header.lot102Phases.find((phase) => phase.phase === "after-prep");
    assert.ok(lot102DomWrite, "lot 102 transition captures hidden DOM write phase");
    assert.match(lot102DomWrite.lotText, /^Lot 102$/, "lot 102 number written during hidden transition");
    assert.equal(lot102DomWrite.reserveText, "", "lot 102 blank Has Reserve written while hidden");
    assert.equal(lot102DomWrite.reservePlaceholder, true, "lot 102 placeholder row preserved while hidden");
    assert.equal(lot102DomWrite.lotEnterPrep, true, "lot 102 number hidden before dom-write report");
    assert.equal(lot102DomWrite.reserveEnterPrep, true, "lot 102 reserve hidden before dom-write report");
    assert.equal(lot102DomWrite.reserveVisible, false, "lot 102 reserve is not visible at dom-write report");
    assert.ok(lot102Prep, "lot 102 transition captures entrance prep phase");
    assert.equal(lot102Prep.lotEnterPrep, true, "lot number receives entrance prep before reveal");
    assert.equal(lot102Prep.reserveEnterPrep, true, "reserve row receives entrance prep before reveal");

    const lot102Entrance = header.lot102Phases.find((phase) => phase.phase === "entrance-start");
    assert.ok(lot102Entrance, "lot 102 captures shared entrance start");
    assert.equal(lot102Entrance.lotSlideIn, true, "lot number entrance starts in shared frame");
    assert.equal(lot102Entrance.reserveSlideIn, true, "reserve entrance starts in shared frame");

    const lot102EarlyMismatch = header.lot102EarlyPhases.find(
      (phase) =>
        phase.phase === "after-dom-write" &&
        phase.lotText.includes("102") &&
        (phase.lotSlideIn || (!phase.lotEnterPrep && !phase.lotFadeOut)),
    );
    assert.equal(lot102EarlyMismatch, undefined, "lot 102 number does not appear settled before shared entrance");

    assert.match(header.lot102Settled.lotText, /^Lot 102$/, "lot 102 settles with synchronized lot number");
    assert.equal(header.lot102Settled.reserveText, "", "lot 102 settles with blank Has Reserve row");
    assert.equal(header.lot102Settled.reservePlaceholder, true, "lot 102 keeps placeholder spacing after settle");

    const lot103DomWrite = header.lot103Phases.find((phase) => phase.phase === "after-dom-write");
    const lot103Prep = header.lot103Phases.find((phase) => phase.phase === "after-prep");
    assert.ok(lot103DomWrite, "lot 103 transition captures hidden DOM write phase");
    assert.match(lot103DomWrite.lotText, /^Lot 103$/, "lot 103 number written while hidden");
    assert.match(
      lot103DomWrite.reserveText,
      /Offered Without Reserve/,
      "lot 103 reserve text written while hidden",
    );
    assert.equal(lot103DomWrite.lotEnterPrep, true, "lot 103 lot number hidden before dom-write report");
    assert.equal(lot103DomWrite.reserveEnterPrep, true, "lot 103 reserve hidden before dom-write report");
    assert.equal(lot103DomWrite.reserveVisible, false, "lot 103 reserve is not visible at dom-write report");
    assert.ok(lot103Prep, "lot 103 transition captures entrance prep phase");
    assert.equal(lot103Prep.lotEnterPrep, true, "lot 103 lot number prepared before reveal");
    assert.equal(lot103Prep.reserveEnterPrep, true, "lot 103 reserve prepared before reveal");

    const lot103Entrance = header.lot103Phases.find((phase) => phase.phase === "entrance-start");
    assert.ok(lot103Entrance, "lot 103 captures shared entrance start");
    assert.equal(lot103Entrance.lotSlideIn, true, "lot 103 lot number animates with reserve");
    assert.equal(lot103Entrance.reserveSlideIn, true, "lot 103 reserve animates with lot number");
    assert.match(
      header.lot103Settled.reserveText,
      /Offered Without Reserve/,
      "lot 103 reserve settles once with lot number",
    );

    assert.match(header.rapidLot103Settled.lotText, /^Lot 103$/, "rapid lot changes end on lot 103 number");
    assert.match(
      header.rapidLot103Settled.reserveText,
      /Offered Without Reserve/,
      "rapid lot changes end on lot 103 reserve text",
    );
    assert.ok(
      !header.lot102Phases.some(
        (phase) =>
          phase.phase === "after-dom-write" &&
          phase.lotKey &&
          phase.lotKey.includes("102") &&
          phase.reserveVisible,
      ),
      "lot 102 reserve dom write never exposes visible incoming reserve text",
    );
    assert.ok(
      !header.lot103Phases.some(
        (phase) =>
          phase.phase === "after-dom-write" &&
          phase.lotKey &&
          phase.lotKey.includes("103") &&
          phase.reserveVisible,
      ),
      "lot 103 reserve dom write never exposes visible incoming reserve text",
    );
    assert.ok(
      !header.rapidPhases.some(
        (phase) => phase.lotKey === "Lot 101" && phase.phase === "entrance-start",
      ),
      "stale lot 101 header callbacks do not replay after rapid lot changes",
    );
  },
);

test("stream bid current bid renders without symbol gap and uses one text node", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /function normalizeBidDisplayText/);
  assert.ok(html.includes('return text.replace(/^\\$\\s+/, "$");'));
  assert.match(html, /function renderBidSection/);
  assert.match(html, /normalizeBidDisplayText\(resolveBiddingPrice\(display\)\)/);
  assert.match(html, /primaryBidEl\.textContent = state\.bid/);
  assert.doesNotMatch(html, /primaryBidEl\.innerHTML/);
});

test("stream bid slideshow reuses legacy pylon photo cycle behavior", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const legacy = read("desktop/src/displays/bundled/legacy-pylon-v1.html");
  assert.match(html, /PHOTO_CYCLE_MS = 6000/);
  assert.match(html, /PHOTO_TRANSITION_MS = 650/);
  assert.match(html, /function transitionPhoto/);
  assert.match(html, /function setPhotos/);
  assert.match(html, /clearInterval\(photoCycleTimer\)/);
  assert.match(html, /if \(photoList\.length > 1\)/);
  assert.match(html, /photo-enter/);
  assert.match(legacy, /PHOTO_CYCLE_MS = 6000/);
  assert.match(legacy, /PHOTO_TRANSITION_MS = 650/);
});

test("stream bid text animations reuse legacy pylon fade and slide classes", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const legacy = read("desktop/src/displays/bundled/legacy-pylon-v1.html");
  assert.match(html, /FADE_MS = 250/);
  assert.match(html, /function transitionText/);
  assert.match(html, /function transitionCurrencyRows/);
  assert.match(html, /@keyframes fadeOut/);
  assert.match(html, /@keyframes slideInRight/);
  assert.match(html, /\.fade-out[\s\S]*animation:\s*fadeOut 250ms/);
  assert.match(html, /\.slide-in-right[\s\S]*animation:\s*slideInRight 250ms/);
  assert.match(legacy, /FADE_MS = 250/);
  assert.match(legacy, /@keyframes fadeOut/);
  assert.match(legacy, /@keyframes slideInRight/);
});

test("stream ticker logo asset exists for packaging and validation fixtures", () => {
  const logoPath = path.join(repoRoot, "public", "displays", "pylon", "logo.png");
  assert.ok(fs.existsSync(logoPath), `missing logo asset at ${logoPath}`);
  const copyRuntime = read("desktop/scripts/copy-runtime-assets.mjs");
  assert.match(copyRuntime, /validateStreamTickerLogoAsset/);
});

test("composite fixture layers bid and ticker without duplicate ticker markup in bid html", () => {
  const bid = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const ticker = read("desktop/src/displays/bundled/stream-ticker-v1.html");
  assert.doesNotMatch(bid, /stream-ticker-bar/);
  assert.match(ticker, /stream-ticker-bar/);
});

test(
  "stream display validation screenshots are 3840x2160 with expected alpha behavior",
  { timeout: 180000 },
  async () => {
    const {
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      TICKER_HEIGHT,
      OUTPUT_PNGS,
      captureStreamDisplayScreenshots,
    } = await import("./validate-stream-displays-screenshots.mjs");

    const sharpModule = await import(
      path.join(repoRoot, "desktop", "node_modules", "sharp", "lib", "index.js")
    ).catch(() => import("sharp"));
    const sharp = sharpModule.default ?? sharpModule;

    const { written } = await captureStreamDisplayScreenshots();

    for (const fileName of Object.values(OUTPUT_PNGS)) {
      const filePath = written[fileName];
      assert.ok(filePath, `missing screenshot output for ${fileName}`);
      assert.ok(fs.existsSync(filePath), `screenshot not written: ${filePath}`);
      const metadata = await sharp(filePath).metadata();
      assert.equal(metadata.width, CANVAS_WIDTH, `${fileName} width`);
      assert.equal(metadata.height, CANVAS_HEIGHT, `${fileName} height`);
    }

    const bidBuffer = await sharp(written[OUTPUT_PNGS.bid]).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    const bidPixels = bidBuffer.data;
    const bidChannels = bidBuffer.info.channels;
    const whiteFieldX = 3500;
    const whiteFieldY = 1700;
    const whiteFieldIndex = (whiteFieldY * CANVAS_WIDTH + whiteFieldX) * bidChannels;
    assert.ok(bidPixels[whiteFieldIndex] > 240, "white field pixel should be opaque white");
    assert.ok(bidPixels[whiteFieldIndex + 1] > 240, "white field pixel should be opaque white");
    assert.ok(bidPixels[whiteFieldIndex + 2] > 240, "white field pixel should be opaque white");
    assert.ok(bidPixels[whiteFieldIndex + 3] > 240, "white field pixel should be opaque");

    const pipCenterX = Math.round(2886.0033333334 + 882.77 / 2);
    const pipCenterY = Math.round(71.2266666667 + 496.558125 / 2);
    const pipAlphaBuffer = await sharp(written[OUTPUT_PNGS.pipAlpha]).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    const pipPixels = pipAlphaBuffer.data;
    const pipChannels = pipAlphaBuffer.info.channels;
    const pipIndex = (pipCenterY * CANVAS_WIDTH + pipCenterX) * pipChannels;
    const pipRed = pipPixels[pipIndex];
    const pipGreen = pipPixels[pipIndex + 1];
    const pipBlue = pipPixels[pipIndex + 2];
    const pipShowsContrast =
      (pipRed > 200 && pipBlue > 200) || (pipGreen > 200 && pipBlue > 200) || pipRed + pipBlue > 400;
    assert.ok(
      pipShowsContrast,
      "PIP center pixel should expose the contrasting background rather than remain white",
    );
    assert.ok(
      !(pipRed > 240 && pipGreen > 240 && pipBlue > 240),
      "PIP center pixel must not remain an opaque white fill",
    );

    const tickerAlphaBuffer = await sharp(written[OUTPUT_PNGS.tickerAlpha])
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const tickerPixels = tickerAlphaBuffer.data;
    const tickerChannels = tickerAlphaBuffer.info.channels;
    const aboveTickerY = 1000;
    const aboveTickerX = Math.round(CANVAS_WIDTH / 2);
    const aboveIndex = (aboveTickerY * CANVAS_WIDTH + aboveTickerX) * tickerChannels;
    assert.ok(
      tickerPixels[aboveIndex] > 80 && tickerPixels[aboveIndex] < 180,
      "canvas above ticker should show the checkerboard background",
    );

    const tickerBarY = CANVAS_HEIGHT - Math.round(TICKER_HEIGHT / 2);
    const tickerBarX = 480;
    const tickerBarIndex = (tickerBarY * CANVAS_WIDTH + tickerBarX) * tickerChannels;
    assert.ok(
      tickerPixels[tickerBarIndex] < 40 && tickerPixels[tickerBarIndex + 1] < 40,
      "bottom ticker bar should be opaque dark",
    );

    const composite = read(
      path.join("desktop", "validation-output", "stream-displays", "stream-composite-wrapper.html"),
    );
    assert.match(composite, /stream-bid-fixture\.html/);
    assert.match(composite, /stream-ticker-fixture\.html/);
  },
);
