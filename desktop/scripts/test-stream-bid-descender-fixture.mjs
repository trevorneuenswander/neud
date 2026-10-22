#!/usr/bin/env node
/**
 * Stream Bid title fixture (Pass 22 — fixed vertical slab, zero vertical crop).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadValidationPuppeteer } from "./lib/resolve-validation-browser.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const htmlPath = path.join(repoRoot, "desktop/src/displays/bundled/stream-bid-display-v1.html");
const SAFETY_PX = 8;
const ACCEPTANCE_A = "yy1987 Mercedes-Benz 560 SLyyjjjgggg";
const FIXTURES = [
  ACCEPTANCE_A,
  "1987 Mercedes-Benz 560 SLygj",
  "1987 Mercedes-Benz 560 SLygjpq",
  "Luxury",
  "Spyder",
  "Jaguar",
  "Pagani",
  "Flying Spur",
];

async function prepareTitle(page, title) {
  await page.evaluate(async (text) => {
    if (document.fonts?.ready) await document.fonts.ready;
    for (let i = 0; i < 40 && !window.__streamBidTitleFontMetrics; i += 1) {
      await new Promise((r) => setTimeout(r, 16));
    }
    const el = document.getElementById("vehicleTitle");
    if (!el) throw new Error("missing vehicleTitle");
    el.setAttribute("data-title", text);
    const presentation = window.__streamBidMeasureTitlePresentation(text);
    window.applyTitleFontMetrics(presentation.fontSize || 120);
    window.__streamBidApplyTitleLayout(el, text, presentation);
    window.__streamBidPaintTitleCanvas(0);
  }, title);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function measureFullDisplayTitleInk(page) {
  const meta = await page.evaluate(() => {
    const canvas = document.getElementById("lotTitleCanvas");
    const stage = document.getElementById("stage");
    const geom = window.__streamBidCaptureTitleGeometry();
    const audit = window.__streamBidTitleStageAudit;
    const proof = window.__streamBidTitleBitmapProof;
    if (!canvas || !stage || !audit) return { ok: false, reason: "missing compositor/audit" };
    const stageBox = stage.getBoundingClientRect();
    const scaleX = stageBox.width / 3840;
    const scaleY = stageBox.height / 2160;
    const bandTop = Math.max(0, audit.titleViewportY - 24);
    const bandBottom = Math.min(2160, (audit.inkBottomStage || audit.titleViewportY) + 160);
    return {
      ok: true,
      x: Math.max(0, Math.floor(stageBox.left + audit.titleViewportX * scaleX)),
      y: Math.max(0, Math.floor(stageBox.top + bandTop * scaleY)),
      width: Math.max(1, Math.ceil(audit.titleViewportWidth * scaleX)),
      height: Math.max(1, Math.ceil((bandBottom - bandTop) * scaleY)),
      geom,
      audit,
      proof,
    };
  });
  if (!meta.ok) return meta;

  const png = await page.screenshot({
    type: "png",
    clip: {
      x: meta.x,
      y: meta.y,
      width: Math.min(meta.width, 3600),
      height: Math.min(meta.height, 600),
    },
  });

  const pixels = await page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let lowest = -1;
    let inkRows = 0;
    let hardCut = false;
    for (let y = height - 1; y >= 0; y -= 1) {
      let rowInk = 0;
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] > 0) rowInk += 1;
      }
      if (rowInk > 0) {
        if (lowest < 0) lowest = y;
        inkRows += 1;
      }
    }
    if (lowest >= 0 && lowest < height - 1) {
      let belowInk = 0;
      for (let x = 0; x < width; x += 1) {
        if (data[((lowest + 1) * width + x) * 4 + 3] > 0) belowInk += 1;
      }
      // Flat cut: dense ink on last row with zero below — soft antialias has fade.
      const lastRowInk = (() => {
        let n = 0;
        for (let x = 0; x < width; x += 1) {
          if (data[(lowest * width + x) * 4 + 3] > 8) n += 1;
        }
        return n;
      })();
      hardCut = belowInk === 0 && lastRowInk > width * 0.15 && lowest > height * 0.3;
    }
    const safetyPx = lowest >= 0 ? height - 1 - lowest : height;
    return { lowestInkY: lowest, inkRows, hardCut, safetyPx };
  }, png.toString("base64"));

  return { ...meta, ...pixels };
}

test("Stream Bid Pass 22: fixed vertical slab contracts", () => {
  const html = fs.readFileSync(htmlPath, "utf8");
  assert.match(html, /data-title-layout="pass22"/);
  assert.match(html, /bitmap-composite/);
  assert.match(html, /TITLE_SLAB_HEIGHT = 480/);
  assert.match(html, /TITLE_SLAB_BASELINE_Y = 200/);
  assert.match(html, /fixed-vertical-slab-zero-vertical-crop/);
  assert.match(html, /verticalCrop: false/);
  assert.match(html, /productionBaselineY - slabBaseline/);
  assert.match(html, /textBaseline = "alphabetic"/);
  assert.match(html, /a > 0/);
  assert.doesNotMatch(html, /LOT_TITLE_BASELINE_VISUAL_OFFSET_Y/);
  assert.doesNotMatch(html, /ink\.top,\s*\n\s*ink\.width,\s*\n\s*ink\.height/);
  assert.match(html, /drawImage\(bitmap/);
  assert.match(html, /ctx\.rect\(layout\.x, 0, layout\.width, CANVAS_H\)/);
  assert.doesNotMatch(html, /ctx\.fillText\(text, titleX/);
});

test("Stream Bid Pass 22: slab retained + visible descenders", async (t) => {
  let runtime;
  try {
    runtime = await loadValidationPuppeteer({ repoRoot });
  } catch (error) {
    t.skip(`Browser runtime unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const browser = await runtime.puppeteer.launch(runtime.launchOptions);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 3840, height: 2160, deviceScaleFactor: 1 });
    await page.setContent(fs.readFileSync(htmlPath, "utf8"), { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts?.ready);

    await prepareTitle(page, ACCEPTANCE_A);
    const geom = await page.evaluate(() => window.__streamBidCaptureTitleGeometry());
    assert.equal(geom.ok, true);
    assert.equal(geom.parentIsStage, true);
    assert.equal(geom.usesFillTextOnStage, false);
    assert.equal(geom.layout, "pass22");
    assert.ok(geom.proof, "bitmap proof present");
    assert.equal(geom.audit?.verticalCrop, false);
    assert.equal(geom.proof?.normalizedH, 480, "fixed slab height retained");
    assert.ok(geom.proof.ink?.found, "diagnostic ink found");
    assert.ok(
      geom.proof.bottomPadActual >= 80,
      `slab bottom clearance ${geom.proof.bottomPadActual}`,
    );

    console.log(JSON.stringify({ architecture: geom }));

    for (const fixture of FIXTURES) {
      await prepareTitle(page, fixture);
      const result = await measureFullDisplayTitleInk(page);
      assert.equal(result.ok, true, `${fixture}: ${result.reason || "fail"}`);
      assert.ok(result.lowestInkY >= 0, `${fixture}: ink`);
      assert.equal(result.hardCut, false, `${fixture}: no hard cut / flat descender`);
      assert.equal(result.proof?.verticalCrop, false, `${fixture}: no vertical crop`);
      assert.equal(result.proof?.normalizedH, 480, `${fixture}: slab height`);
      // Descenders must exist below alphabetic baseline inside the slab (not safetyPx alone).
      if (/[ygjpq]/i.test(fixture)) {
        assert.ok(
          (result.proof?.ink?.bottom ?? 0) > (result.proof?.slabBaselineY ?? 200),
          `${fixture}: ink extends below slab baseline`,
        );
      }
      assert.ok(result.inkRows >= 3, `${fixture}: glyph rows`);
      console.log(
        JSON.stringify({
          fixture,
          hardCut: result.hardCut,
          safetyPx: result.safetyPx,
          bottomPadActual: result.proof.bottomPadActual,
          inkBottom: result.proof.ink?.bottom,
          slabBaselineY: result.proof.slabBaselineY,
          slabH: result.proof.normalizedH,
          stageBottomMinusInk: result.audit.stageBottomMinusInk,
        }),
      );
    }
  } finally {
    await browser.close();
  }
});
