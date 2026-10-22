/**
 * Live Chromium offscreen paint probe for Key + Fill source alpha contract.
 * Uses the same BrowserWindow({ offscreen: true }) + toBitmap path as External Device output.
 *
 * Run:
 *   npm run build -w @neud/desktop
 *   ./desktop/node_modules/.bin/electron desktop/scripts/probe-chromium-source-alpha.mjs
 *
 * Optional: NEUD_KEY_FILL_DEBUG_EXPORT=1 to write PNGs under desktop/validation-output/key-fill-alpha/
 */
import { app, BrowserWindow, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const WIDTH = 640;
const HEIGHT = 360;
const RED_PIXEL_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function detectPixelOrder() {
  const probe = nativeImage.createFromDataURL(RED_PIXEL_DATA_URL).toBitmap();
  if (probe.length < 4) return "unknown";
  if ((probe[2] ?? 0) > 200 && (probe[0] ?? 0) < 50) return "bgra";
  if ((probe[0] ?? 0) > 200 && (probe[2] ?? 0) < 50) return "rgba";
  return "unknown";
}

function normalizeToBgra(bitmap, order) {
  if (order !== "rgba") return Buffer.from(bitmap);
  const out = Buffer.alloc(bitmap.length);
  for (let i = 0; i + 3 < bitmap.length; i += 4) {
    out[i] = bitmap[i + 2] ?? 0;
    out[i + 1] = bitmap[i + 1] ?? 0;
    out[i + 2] = bitmap[i] ?? 0;
    out[i + 3] = bitmap[i + 3] ?? 0;
  }
  return out;
}

function sampleCenter(bgra, x, y, w) {
  const ox = (Math.floor(y) * w + Math.floor(x)) * 4;
  return {
    offset: ox,
    b: bgra[ox] ?? 0,
    g: bgra[ox + 1] ?? 0,
    r: bgra[ox + 2] ?? 0,
    a: bgra[ox + 3] ?? 0,
  };
}

function inferAlphaMode(pixel) {
  if (pixel.a <= 0) return "unknown";
  if (pixel.a >= 250) return "straight-or-opaque";
  const maxRgb = Math.max(pixel.r, pixel.g, pixel.b);
  const premulExpected = Math.round((255 * pixel.a) / 255);
  // 50% white: straight keeps RGB≈255; premul has RGB≈alpha
  if (Math.abs(maxRgb - 255) <= 24 && pixel.a > 40 && pixel.a < 220) return "straight";
  if (Math.abs(maxRgb - premulExpected) <= 24) return "premultiplied";
  if (maxRgb > premulExpected + 30) return "straight";
  return "unknown";
}

function loadProcessor() {
  try {
    return require(path.join(desktopRoot, "dist/output/key-fill-processor.js"));
  } catch {
    return null;
  }
}

/** Mirror of compositeFillOverBlack — kept inline so the Electron probe does not depend on dist require. */
function compositeFillOverBlackInline(bgra) {
  const out = Buffer.alloc(bgra.length);
  for (let i = 0; i + 3 < bgra.length; i += 4) {
    const a = bgra[i + 3] ?? 0;
    if (a === 0) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 255;
      continue;
    }
    out[i] = bgra[i] ?? 0;
    out[i + 1] = bgra[i + 1] ?? 0;
    out[i + 2] = bgra[i + 2] ?? 0;
    out[i + 3] = 255;
  }
  return out;
}

function normalizePaintImage(image, pixelOrder) {
  const size = image.getSize();
  let bitmap = image.toBitmap();
  let width = size.width;
  let height = size.height;
  if (width !== WIDTH || height !== HEIGHT) {
    const resized = image.resize({ width: WIDTH, height: HEIGHT, quality: "best" });
    bitmap = resized.toBitmap();
    width = WIDTH;
    height = HEIGHT;
  }
  return { bgra: normalizeToBgra(bitmap, pixelOrder), width, height, rawOrder: pixelOrder };
}

/**
 * Single offscreen window:
 * 1) transparent capture (source) via paint path (same as External Device)
 * 2) force black page background and capturePage (Chromium-over-black reference)
 */
async function captureSourceAndChromiumBlack() {
  const fixturePath = path.join(__dirname, "fixtures/key-fill-alpha-fixture.html");
  const pixelOrder = detectPixelOrder();

  const window = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    backgroundColor: "#00000000",
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setFrameRate(60);

  // Attach before load — first paint can fire during loadFile/loadURL.
  let latestPaint = null;
  window.webContents.on("paint", (_event, _dirty, image) => {
    try {
      if (!image || image.isEmpty()) return;
      latestPaint = normalizePaintImage(image, pixelOrder);
    } catch {
      // ignore transient paint failures
    }
  });

  const waitForPaint = async (label) => {
    const deadline = Date.now() + 8000;
    latestPaint = null;
    window.webContents.invalidate();
    while (Date.now() < deadline) {
      if (latestPaint) return latestPaint;
      await new Promise((r) => setTimeout(r, 50));
    }
    // Fallback: capturePage still exercises Chromium pixels for diagnostics.
    const shot = await window.webContents.capturePage();
    if (shot && !shot.isEmpty()) return normalizePaintImage(shot, pixelOrder);
    throw new Error(`paint timeout (${label})`);
  };

  await window.loadFile(fixturePath);
  await new Promise((r) => setTimeout(r, 250));
  const sourceFrame = await waitForPaint("transparent-source");

  await window.webContents.executeJavaScript(`
    document.documentElement.style.background = '#000000';
    document.body.style.background = '#000000';
  `);
  await new Promise((r) => setTimeout(r, 150));
  const chromiumBlackFrame = await waitForPaint("chromium-black");

  window.destroy();
  return { sourceFrame, chromiumBlackFrame };
}

function buildDifferenceBgra(neud, reference) {
  const out = new Uint8Array(neud.length);
  for (let i = 0; i + 3 < neud.length; i += 4) {
    const dr = Math.abs((neud[i + 2] ?? 0) - (reference[i + 2] ?? 0));
    const dg = Math.abs((neud[i + 1] ?? 0) - (reference[i + 1] ?? 0));
    const db = Math.abs((neud[i] ?? 0) - (reference[i] ?? 0));
    const mag = Math.min(255, (dr + dg + db) * 4);
    out[i] = mag;
    out[i + 1] = mag;
    out[i + 2] = mag;
    out[i + 3] = 255;
  }
  return out;
}

function compareFillOnlyToChromium(sourceBgra, neudFillOnly, chromiumBlack, width) {
  const regions = [
    ["a25", 96, 32],
    ["a50", 160, 32],
    ["a75", 224, 32],
    ["a100", 288, 32],
    ["cssOpacity", 288, 96],
    ["transparent", 32, 32],
  ];
  const comparisons = {};
  let maxAbs = 0;
  for (const [name, x, y] of regions) {
    const n = sampleCenter(neudFillOnly, x, y, width);
    const c = sampleCenter(chromiumBlack, x, y, width);
    const abs = Math.max(Math.abs(n.r - c.r), Math.abs(n.g - c.g), Math.abs(n.b - c.b));
    maxAbs = Math.max(maxAbs, abs);
    comparisons[name] = { neud: n, chromium: c, maxChannelDelta: abs };
  }
  // Full-frame stats (ignore alpha).
  let sum = 0;
  let count = 0;
  let frameMax = 0;
  for (let i = 0; i + 3 < neudFillOnly.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      const d = Math.abs((neudFillOnly[i + c] ?? 0) - (chromiumBlack[i + c] ?? 0));
      sum += d;
      count += 1;
      frameMax = Math.max(frameMax, d);
    }
  }
  return {
    regions: comparisons,
    regionMaxAbs: maxAbs,
    frameMeanAbs: count ? sum / count : 0,
    frameMaxAbs: frameMax,
    sourceA50: sampleCenter(sourceBgra, 160, 32, width),
  };
}

function analyze(frame) {
  const { bgra, width, height, rawOrder } = frame;
  const samples = {
    transparent: sampleCenter(bgra, 32, 32, width),
    a25: sampleCenter(bgra, 96, 32, width),
    a50: sampleCenter(bgra, 160, 32, width),
    a75: sampleCenter(bgra, 224, 32, width),
    a100: sampleCenter(bgra, 288, 32, width),
    red: sampleCenter(bgra, 32, 96, width),
    green: sampleCenter(bgra, 96, 96, width),
    blue: sampleCenter(bgra, 160, 96, width),
    white: sampleCenter(bgra, 224, 96, width),
    cssOpacity: sampleCenter(bgra, 288, 96, width),
  };

  // Scan white text area for a partial-alpha edge pixel.
  let textEdge = null;
  for (let y = 150; y < 200 && !textEdge; y += 1) {
    for (let x = 16; x < 200; x += 1) {
      const p = sampleCenter(bgra, x, y, width);
      if (p.a > 20 && p.a < 235 && p.r > 180) {
        textEdge = { x, y, ...p };
        break;
      }
    }
  }

  let shadowPixel = null;
  for (let y = 120; y < 160 && !shadowPixel; y += 1) {
    for (let x = 440; x < 560; x += 1) {
      const p = sampleCenter(bgra, x, y, width);
      if (p.a > 20 && p.a < 200 && p.r < 80 && p.g < 80 && p.b < 80) {
        shadowPixel = { x, y, ...p };
        break;
      }
    }
  }

  const a50Mode = inferAlphaMode(samples.a50);
  const a25Mode = inferAlphaMode(samples.a25);
  const cssMode = inferAlphaMode(samples.cssOpacity);
  const modes = [a50Mode, a25Mode, cssMode].filter((m) => m === "straight" || m === "premultiplied");
  const straightVotes = modes.filter((m) => m === "straight").length;
  const premulVotes = modes.filter((m) => m === "premultiplied").length;
  const verifiedAlphaMode =
    straightVotes > premulVotes ? "straight" : premulVotes > straightVotes ? "premultiplied" : "unknown";

  return {
    method: "Electron BrowserWindow offscreen paint → NativeImage.toBitmap → BGRA normalize (same as OffscreenOutputRenderer)",
    width,
    height,
    rawNativeImageOrder: rawOrder,
    normalizedOrder: "bgra",
    verifiedAlphaMode,
    samples,
    textEdge,
    shadowPixel,
    expectations: {
      a25AlphaApprox: 64,
      a50AlphaApprox: 128,
      a75AlphaApprox: 191,
      a100AlphaApprox: 255,
      transparentAlpha: 0,
    },
  };
}

async function maybeExportDebug(frame, analysis, processor, fillOnlyCompare) {
  if (process.env.NEUD_KEY_FILL_DEBUG_EXPORT !== "1" && !fillOnlyCompare) return null;
  const outDir = path.join(desktopRoot, "validation-output/key-fill-alpha");
  fs.mkdirSync(outDir, { recursive: true });

  const writeBgraPng = (name, bgra) => {
    const img = nativeImage.createFromBitmap(Buffer.from(bgra), {
      width: frame.width,
      height: frame.height,
    });
    fs.writeFileSync(path.join(outDir, name), img.toPNG());
  };

  writeBgraPng("source.png", frame.bgra);

  if (fillOnlyCompare) {
    writeBgraPng("neud-fill-only-black.png", fillOnlyCompare.neudFillOnly);
    writeBgraPng("chromium-reference-black.png", fillOnlyCompare.chromiumBlack);
    writeBgraPng(
      "difference.png",
      buildDifferenceBgra(fillOnlyCompare.neudFillOnly, fillOnlyCompare.chromiumBlack),
    );
  }

  if (processor?.createKeyFillFramePair) {
    const result = processor.createKeyFillFramePair(frame.bgra, {
      frameNumber: 0,
      displayTime: 0,
      displayDuration: 1001,
      timeScale: 60000,
      width: frame.width,
      height: frame.height,
      sourceAlphaMode: analysis.verifiedAlphaMode === "premultiplied" ? "premultiplied" : "straight",
      keyPolarity: "whiteOnBlack",
    });
    if (result.ok) {
      writeBgraPng("fill.png", result.pair.fill);
      writeBgraPng("key.png", result.pair.key);

      const black = new Uint8Array(frame.bgra.length);
      const white = new Uint8Array(frame.bgra.length);
      processor.compositePremultipliedFillOverBackground(
        result.pair.fill,
        result.pair.key,
        { r: 0, g: 0, b: 0 },
        black,
      );
      processor.compositePremultipliedFillOverBackground(
        result.pair.fill,
        result.pair.key,
        { r: 255, g: 255, b: 255 },
        white,
      );
      writeBgraPng("composite-black.png", black);
      writeBgraPng("composite-white.png", white);
    }
  }

  fs.writeFileSync(path.join(outDir, "analysis.json"), JSON.stringify(analysis, null, 2));
  return outDir;
}

async function main() {
  await app.whenReady();
  const { sourceFrame: frame, chromiumBlackFrame } = await captureSourceAndChromiumBlack();
  const analysis = analyze(frame);
  const processor = loadProcessor();

  const neudFillOnly = compositeFillOverBlackInline(frame.bgra);
  const fillOnlyCompare = {
    neudFillOnly,
    chromiumBlack: chromiumBlackFrame.bgra,
    comparison: compareFillOnlyToChromium(
      frame.bgra,
      neudFillOnly,
      chromiumBlackFrame.bgra,
      frame.width,
    ),
  };

  const exportDir = await maybeExportDebug(frame, analysis, processor, fillOnlyCompare);

  const report = {
    ok: true,
    ...analysis,
    exportDir,
    fillOnlyPremulFix: fillOnlyCompare
      ? {
          oldFormula: "RGBout = RGBpremul × (A/255)  // incorrect double-premultiply",
          newFormula: "RGBout = RGBpremul; Aout = 255  // premul over black",
          comparison: fillOnlyCompare.comparison,
        }
      : null,
    contractRecommendation: {
      channelOrder: "bgra",
      alphaMode: analysis.verifiedAlphaMode,
      fillMode: "premultiplied",
      keyPolarityDefault: "whiteOnBlack",
    },
  };

  const outJson = path.join(desktopRoot, "validation-output/key-fill-alpha/live-probe.json");
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
