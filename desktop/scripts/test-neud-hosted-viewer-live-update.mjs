#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const deliveryPath = pathToFileURL(
  path.join(repoRoot, "src/lib/hosted/hosted-viewer-delivery.ts"),
).href;

const fingerprintPath = pathToFileURL(
  path.join(repoRoot, "src/lib/hosted/canonical-payload-fingerprint.ts"),
).href;

const {
  fingerprintCanonicalPayloadContent,
  fingerprintCanonicalPayloadStructure,
} = await import(fingerprintPath);

const {
  shouldApplyRevisionStatus,
  shouldDeliverCanonicalPayload,
  shouldDeliverCanonicalRevision,
} = await import(deliveryPath);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const FIXTURE_A = {
  current: { lot: "101", title: "Fixture A Lot", price: "$ 10,000", status: "No Reserve" },
  auctionDisplay: { photos: ["https://example.test/a.jpg"] },
  next: [],
  lots: [],
};

const FIXTURE_B = {
  current: { lot: "102", title: "Fixture B Lot", price: "$ 25,000", status: "Reserve Met" },
  auctionDisplay: { photos: ["https://example.test/b.jpg", "https://example.test/b2.jpg"] },
  next: [{ lot: "999", title: "Upcoming" }],
  lots: [],
};

const FIXTURE_C = {
  current: { lot: "103", title: "Fixture C Lot", price: "$ 40,000", status: "Sold" },
  auctionDisplay: { photos: ["https://example.test/c.jpg"] },
  next: [],
  lots: [],
};

test("shouldDeliverCanonicalRevision posts new revisions after prior ack", () => {
  assert.equal(
    shouldDeliverCanonicalRevision({
      targetRevision: 6,
      lastAcknowledgedRevision: null,
      iframeBooted: true,
    }),
    true,
  );
  assert.equal(
    shouldDeliverCanonicalRevision({
      targetRevision: 6,
      lastAcknowledgedRevision: 6,
      iframeBooted: true,
    }),
    false,
  );
  assert.equal(
    shouldDeliverCanonicalRevision({
      targetRevision: 7,
      lastAcknowledgedRevision: 6,
      iframeBooted: true,
    }),
    true,
  );
  assert.equal(
    shouldDeliverCanonicalRevision({
      targetRevision: 7,
      lastAcknowledgedRevision: 6,
      iframeBooted: false,
    }),
    false,
  );
});

test("shouldApplyRevisionStatus ignores stale render status from older revisions", () => {
  assert.equal(
    shouldApplyRevisionStatus({
      statusRevision: 7,
      latestRevision: 8,
      lastAppliedRevision: 8,
    }),
    false,
  );
  assert.equal(
    shouldApplyRevisionStatus({
      statusRevision: 8,
      latestRevision: 8,
      lastAppliedRevision: 7,
    }),
    true,
  );
});

test("fingerprintCanonicalPayloadContent changes when bid changes at same revision", () => {
  const fpA = fingerprintCanonicalPayloadContent(FIXTURE_A);
  const fpB = fingerprintCanonicalPayloadContent({
    ...FIXTURE_A,
    current: { ...FIXTURE_A.current, price: "$ 99,999" },
  });
  assert.notEqual(fpA, fpB);
  assert.match(fpA, /^fp-content-[0-9a-f]+$/);
});

test("fingerprintCanonicalPayloadContent ignores updatedAt-only changes", () => {
  const fpA = fingerprintCanonicalPayloadContent({
    ...FIXTURE_A,
    updatedAt: "2026-07-21T12:00:00.000Z",
  });
  const fpB = fingerprintCanonicalPayloadContent({
    ...FIXTURE_A,
    updatedAt: "2026-07-21T13:00:00.000Z",
  });
  assert.equal(fpA, fpB);
});

test("shouldDeliverCanonicalPayload posts when fingerprint changes after revision ack", () => {
  const fingerprint = fingerprintCanonicalPayloadContent(FIXTURE_A);
  const nextFingerprint = fingerprintCanonicalPayloadContent(FIXTURE_B);
  assert.equal(
    shouldDeliverCanonicalPayload({
      targetRevision: 4,
      targetFingerprint: nextFingerprint,
      lastAcknowledgedRevision: 4,
      lastAcknowledgedFingerprint: fingerprint,
      iframeBooted: true,
    }),
    true,
  );
});

test("fingerprintCanonicalPayloadStructure changes when structural fields differ", () => {
  const fpA = fingerprintCanonicalPayloadStructure(FIXTURE_A);
  const fpB = fingerprintCanonicalPayloadStructure(FIXTURE_B);
  assert.notEqual(fpA, fpB);
  assert.match(fpA, /^fp-[0-9a-f]+$/);
});

test("hosted viewer client uses revision-specific delivery state, not generation ack gate", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.match(client, /lastPostedCanonicalRevisionRef/);
  assert.match(client, /lastAcknowledgedCanonicalRevisionRef/);
  assert.match(client, /lastRenderedCanonicalRevisionRef/);
  assert.match(client, /lastPostedPayloadFingerprintRef/);
  assert.match(client, /lastAcknowledgedPayloadFingerprintRef/);
  assert.match(client, /fingerprintCanonicalPayloadContent/);
  assert.match(client, /shouldDeliverCanonicalPayload/);
  assert.doesNotMatch(client, /ackedGenerationRef/);
});

test("viewer revision key is based on published HTML revision only", () => {
  const bundle = read("src/lib/hosted/viewer-bundle.ts");
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  const revisionKeyFn = bundle.match(
    /export function resolveViewerRevisionKey[\s\S]*?^}/m,
  )?.[0];
  assert.ok(revisionKeyFn);
  assert.match(revisionKeyFn, /published_revision_id/);
  assert.doesNotMatch(revisionKeyFn, /canonical_revision/);
  assert.match(client, /key=\{bundle\?\.revisionKey/);
  assert.match(client, /bundle\?\.canonicalRevision/);
});

test("canonical revision change triggers delivery without iframe reload", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  assert.match(client, /loadedRevisionRef/);
  assert.match(client, /bundle\?\.canonicalRevision, bundle\?\.revisionKey/);
  assert.match(client, /scheduleBoundedAckRetries/);
});

test("hosted stream bid live update keeps iframe mounted across revisions 6 7 8", async () => {
  const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
  const { transformStreamBidHtmlForServing } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/displays/stream-display-v2-transform.js"),
    ).href
  );
  const { buildNeudDataUpdateMessage, prepareHostedDisplayDocument } = await Promise.all([
    import(pathToFileURL(path.join(repoRoot, "src/lib/hosted/hosted-display-runtime-bridge.ts")).href),
    import(pathToFileURL(path.join(repoRoot, "src/lib/developer-tools/display-document.ts")).href),
  ]).then(([bridge, documentModule]) => ({
    buildNeudDataUpdateMessage: bridge.buildNeudDataUpdateMessage,
    prepareHostedDisplayDocument: documentModule.prepareHostedDisplayDocument,
  }));

  const rawHtml = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  const preparedHtml = prepareHostedDisplayDocument(
    transformStreamBidHtmlForServing(rawHtml),
  );

  const message6 = buildNeudDataUpdateMessage({ payload: FIXTURE_A, revision: 6 });
  const message7 = buildNeudDataUpdateMessage({ payload: FIXTURE_B, revision: 7 });
  const message8 = buildNeudDataUpdateMessage({ payload: FIXTURE_C, revision: 8 });

  const { puppeteer, launchOptions } = await loadValidationPuppeteer();
  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 3840, height: 2160, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000;"></body></html>`);

    await page.evaluate((html) => {
      window.__neudState = {
        iframeGeneration: 1,
        lastPostedRevision: null,
        lastAckRevision: null,
        lastRenderRevision: null,
        bootCount: 0,
      };
      window.__neudMessages = {};

      const iframe = document.createElement("iframe");
      iframe.id = "display";
      iframe.dataset.generation = "1";
      iframe.sandbox = "allow-scripts";
      iframe.srcdoc = html;
      iframe.style.width = "3840px";
      iframe.style.height = "2160px";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      window.addEventListener("message", (event) => {
        if (event.source !== iframe.contentWindow) {
          return;
        }
        if (event.data?.type === "NEUD_HOSTED_BRIDGE_BOOTED") {
          window.__neudState.bootCount += 1;
          const rev = window.__neudState.nextRevision ?? 6;
          const message = window.__neudMessages[rev];
          if (message) {
            iframe.contentWindow.postMessage(message, "*");
            window.__neudState.lastPostedRevision = rev;
          }
        }
        if (event.data?.type === "NEUD_DATA_UPDATE_RECEIVED") {
          const ackRev = event.data.revision ?? null;
          const currentAck = window.__neudState.lastAckRevision;
          if (currentAck == null || ackRev >= currentAck) {
            window.__neudState.lastAckRevision = ackRev;
          }
        }
        if (event.data?.type === "NEUD_RENDER_STATUS" && event.data.renderCompleted) {
          const renderRev = event.data.revision ?? null;
          const currentRender = window.__neudState.lastRenderRevision;
          if (currentRender == null || renderRev >= currentRender) {
            window.__neudState.lastRenderRevision = renderRev;
          }
        }
      });
    }, preparedHtml);

    const postRevision = async (revision, message) => {
      await page.evaluate(
        ({ revisionKey, messagePayload }) => {
          window.__neudState.nextRevision = revisionKey;
          window.__neudMessages[revisionKey] = messagePayload;
          const iframe = document.getElementById("display");
          if (window.__neudState.bootCount > 0) {
            iframe.contentWindow.postMessage(messagePayload, "*");
            window.__neudState.lastPostedRevision = revisionKey;
          }
        },
        { revisionKey: revision, messagePayload: message },
      );
    };

    const waitForRenderRevision = (revision) =>
      page.waitForFunction(
        (targetRevision) => window.__neudState.lastRenderRevision === targetRevision,
        { timeout: 15000 },
        revision,
      );

    const waitForLotText = async (pattern) => {
      const iframeHandle = await page.waitForSelector("#display");
      const frame = await iframeHandle.contentFrame();
      assert.ok(frame);
      await frame.waitForFunction(
        (regexSource) => {
          const lot = document.getElementById("lotNumber");
          const lotText = lot?.textContent || lot?.getAttribute("data-text") || "";
          return new RegExp(regexSource).test(lotText);
        },
        { timeout: 15000 },
        pattern,
      );
      return frame;
    };

    await page.evaluate((message) => {
      window.__neudMessages[6] = message;
      window.__neudState.nextRevision = 6;
    }, message6);

    await waitForRenderRevision(6);
    let frame = await waitForLotText("101");
    let generation = await page.evaluate(() => document.getElementById("display")?.dataset.generation);
    assert.equal(generation, "1");

    await postRevision(7, message7);
    await waitForRenderRevision(7);
    frame = await waitForLotText("102");
    generation = await page.evaluate(() => document.getElementById("display")?.dataset.generation);
    assert.equal(generation, "1");

    await postRevision(8, message8);
    await waitForRenderRevision(8);
    frame = await waitForLotText("103");

    const fields = await frame.evaluate(() => ({
      lotNumber:
        document.getElementById("lotNumber")?.textContent?.trim() ||
        document.getElementById("lotNumber")?.getAttribute("data-text")?.trim() ||
        "",
      vehicleTitle:
        document.getElementById("vehicleTitle")?.textContent?.trim() ||
        document.getElementById("vehicleTitle")?.getAttribute("data-title")?.trim() ||
        "",
    }));

    const state = await page.evaluate(() => window.__neudState);
    assert.equal(state.bootCount, 1);
    assert.equal(state.lastAckRevision, 8);
    assert.equal(state.lastRenderRevision, 8);
    assert.match(fields.lotNumber, /103/);
    assert.match(fields.vehicleTitle, /Fixture C Lot/);
  } finally {
    await browser.close();
  }
});

test("rapid revisions 7 and 8 leave final DOM at revision 8", async () => {
  const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
  const { transformStreamBidHtmlForServing } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/displays/stream-display-v2-transform.js"),
    ).href
  );
  const bridge = await import(
    pathToFileURL(path.join(repoRoot, "src/lib/hosted/hosted-display-runtime-bridge.ts")).href
  );
  const { prepareHostedDisplayDocument } = await import(
    pathToFileURL(path.join(repoRoot, "src/lib/developer-tools/display-document.ts")).href
  );

  const preparedHtml = prepareHostedDisplayDocument(
    transformStreamBidHtmlForServing(
      read("desktop/src/displays/bundled/stream-bid-display-v1.html"),
    ),
  );
  const message7 = bridge.buildNeudDataUpdateMessage({ payload: FIXTURE_B, revision: 7 });
  const message8 = bridge.buildNeudDataUpdateMessage({ payload: FIXTURE_C, revision: 8 });

  const { puppeteer, launchOptions } = await loadValidationPuppeteer();
  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000;"></body></html>`);
    await page.evaluate((html) => {
      window.__neudState = { lastAckRevision: null, lastRenderRevision: null };
      const iframe = document.createElement("iframe");
      iframe.id = "display";
      iframe.sandbox = "allow-scripts";
      iframe.srcdoc = html;
      document.body.appendChild(iframe);
      window.addEventListener("message", (event) => {
        if (event.source !== iframe.contentWindow) {
          return;
        }
        if (event.data?.type === "NEUD_HOSTED_BRIDGE_BOOTED") {
          window.__neudDeliverQueued?.();
        }
        if (event.data?.type === "NEUD_DATA_UPDATE_RECEIVED") {
          const ackRev = event.data.revision ?? null;
          const currentAck = window.__neudState.lastAckRevision;
          if (currentAck == null || ackRev >= currentAck) {
            window.__neudState.lastAckRevision = ackRev;
          }
        }
        if (event.data?.type === "NEUD_RENDER_STATUS" && event.data.renderCompleted) {
          const renderRev = event.data.revision ?? null;
          const currentRender = window.__neudState.lastRenderRevision;
          if (currentRender == null || renderRev >= currentRender) {
            window.__neudState.lastRenderRevision = renderRev;
          }
        }
      });
    }, preparedHtml);

    await page.evaluate(
      (messages) => {
        const iframe = document.getElementById("display");
        window.__neudDeliverQueued = () => {
          iframe.contentWindow.postMessage(messages.message7, "*");
          window.setTimeout(() => {
            iframe.contentWindow.postMessage(messages.message8, "*");
          }, 100);
        };
      },
      { message7, message8 },
    );

    await page.waitForFunction(() => window.__neudState.lastRenderRevision === 8, {
      timeout: 15000,
    });

    const iframeHandle = await page.$("#display");
    const frame = await iframeHandle.contentFrame();
    await frame.waitForFunction(() => {
      const lot = document.getElementById("lotNumber");
      const lotText = lot?.textContent || lot?.getAttribute("data-text") || "";
      return /103/.test(lotText);
    }, { timeout: 15000 });

    const state = await page.evaluate(() => window.__neudState);
    assert.equal(state.lastAckRevision, 8);

    const lotText = await frame.evaluate(() => {
      const lot = document.getElementById("lotNumber");
      return lot?.textContent?.trim() || lot?.getAttribute("data-text")?.trim() || "";
    });
    assert.match(lotText, /103/);
  } finally {
    await browser.close();
  }
});

test("hosted stream ticker updates slots without iframe reload", async () => {
  const { loadValidationPuppeteer } = await import("./lib/resolve-validation-browser.mjs");
  const { transformStreamTickerHtmlForServing } = await import(
    pathToFileURL(
      path.join(repoRoot, "desktop/dist/displays/stream-display-v2-transform.js"),
    ).href
  );
  const bridge = await import(
    pathToFileURL(path.join(repoRoot, "src/lib/hosted/hosted-display-runtime-bridge.ts")).href
  );
  const { prepareHostedDisplayDocument } = await import(
    pathToFileURL(path.join(repoRoot, "src/lib/developer-tools/display-document.ts")).href
  );

  const preparedHtml = prepareHostedDisplayDocument(
    transformStreamTickerHtmlForServing(
      read("desktop/src/displays/bundled/stream-ticker-v1.html"),
    ),
  );

  const message1 = bridge.buildNeudDataUpdateMessage({
    payload: { next: [{ lot: "301", title: "Ticker A" }] },
    revision: 1,
  });
  const message2 = bridge.buildNeudDataUpdateMessage({
    payload: { next: [{ lot: "302", title: "Ticker B" }] },
    revision: 2,
  });

  const { puppeteer, launchOptions } = await loadValidationPuppeteer();
  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000;"></body></html>`);
    await page.evaluate((html) => {
      window.__neudState = { generation: 1, renderRevision: null };
      const iframe = document.createElement("iframe");
      iframe.id = "display";
      iframe.dataset.generation = "1";
      iframe.sandbox = "allow-scripts";
      iframe.srcdoc = html;
      document.body.appendChild(iframe);
      window.addEventListener("message", (event) => {
        if (event.source !== iframe.contentWindow) {
          return;
        }
        if (event.data?.type === "NEUD_DISPLAY_READY" || event.data?.type === "NEUD_HOSTED_BRIDGE_BOOTED") {
          window.__neudDeliver?.();
        }
        if (event.data?.type === "NEUD_RENDER_STATUS" && event.data.renderCompleted) {
          window.__neudState.renderRevision = event.data.revision ?? null;
        }
      });
    }, preparedHtml);

    const deliver = async (message, revision) => {
      await page.evaluate(
        ({ messagePayload, revisionKey }) => {
          const iframe = document.getElementById("display");
          window.__neudDeliver = () => {
            iframe.contentWindow.postMessage(messagePayload, "*");
          };
          window.__neudState.pendingRevision = revisionKey;
          window.__neudDeliver();
        },
        { messagePayload: message, revisionKey: revision },
      );
    };

    await deliver(message1, 1);
    const iframeHandle = await page.waitForSelector("#display");
    let frame = await iframeHandle.contentFrame();
    await frame.waitForFunction(() => {
      const slot1 = document.getElementById("slot1");
      const text = slot1?.textContent || slot1?.getAttribute("data-text") || "";
      return text.includes("301");
    }, { timeout: 15000 });

    const generationBefore = await page.evaluate(() => document.getElementById("display")?.dataset.generation);
    await deliver(message2, 2);
    await frame.waitForFunction(() => {
      const slot1 = document.getElementById("slot1");
      const text = slot1?.textContent || slot1?.getAttribute("data-text") || "";
      return text.includes("302");
    }, { timeout: 15000 });

    const generationAfter = await page.evaluate(() => document.getElementById("display")?.dataset.generation);
    assert.equal(generationBefore, generationAfter);
  } finally {
    await browser.close();
  }
});

test("portal preview and fullscreen output share the same live viewer pipeline", () => {
  const client = read("src/components/hosted/HostedDisplayViewerClient.tsx");
  const privatePage = read(
    "src/app/portal/projects/[slug]/displays/[displaySlug]/page.tsx",
  );
  const privateFullscreen = read(
    "src/app/portal/projects/[slug]/displays/[displaySlug]/fullscreen/page.tsx",
  );
  const displayCard = read("src/components/hosted/HostedDisplayCard.tsx");

  assert.match(client, /viewerMode/);
  assert.match(client, /portal-preview/);
  assert.match(client, /fullscreen-output/);
  assert.match(client, /bundleRef/);
  assert.match(client, /hasLoadedBundleRef/);
  assert.match(client, /shouldDeliverCanonicalPayload/);
  assert.match(privatePage, /viewerMode="portal-preview"/);
  assert.match(privateFullscreen, /viewerMode="fullscreen-output"/);
  assert.match(displayCard, /viewerMode="portal-preview"/);
  assert.match(displayCard, /HostedDisplayViewerClient/);
});

test("diagnostics panel exposes live-update revision fields without payload values", () => {
  const panel = read("src/components/hosted/HostedViewerDiagnosticsPanel.tsx");
  assert.match(panel, /pollingActive/);
  assert.match(panel, /receivedCanonicalRevision/);
  assert.match(panel, /lastAcknowledgedCanonicalRevision/);
  assert.match(panel, /renderedCanonicalRevision/);
  assert.match(panel, /receivedPayloadFingerprint/);
  assert.doesNotMatch(panel, /bundle\.canonicalPayload/);
});
