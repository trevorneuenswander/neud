/**
 * Phase 2B.2A — Key + Fill signal pipeline tests (hardware-independent).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  NEUD_KEY_FILL_SOURCE_CONTRACT,
  benchmarkKeyFillProcessing,
  compositePremultipliedFillOverBackground,
  compositeStraightSourceOverBackground,
  createKeyFillFramePair,
  diagnosticsFromPair,
  generateFillFramePremultiplied,
  generateKeyFrame,
  keyLumaFromAlphaPolarity,
  readBgraPixel,
  scaleChannelByAlpha,
  writeStraightBgraPixel,
} from "../src/output/key-fill-processor.ts";
import {
  VERIFIED_SOURCE_ALPHA_MODE,
  VERIFIED_SOURCE_CHANNEL_ORDER,
  inferAlphaModeFromSample,
  preserveSourceFrame,
} from "../src/output/source-alpha-analysis.ts";
import { compositeFillOverBlack } from "../src/output/decklink-model.ts";
import { KeyFillSession } from "../src/output/key-fill-session.ts";
import { mapDeckLinkCapabilitiesToExternal, availablePresentationModes } from "../src/output/external-output-capabilities.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..");

function pixel(r, g, b, a) {
  const buf = new Uint8Array(4);
  writeStraightBgraPixel(buf, 0, { r, g, b, a });
  return buf;
}

function expectPixel(buf, offset, expected, label) {
  const p = readBgraPixel(buf, offset);
  assert.equal(p.r, expected.r, `${label} r`);
  assert.equal(p.g, expected.g, `${label} g`);
  assert.equal(p.b, expected.b, `${label} b`);
  if (expected.a !== undefined) assert.equal(p.a, expected.a, `${label} a`);
}

test("canonical source-frame contract is verified BGRA premultiplied", () => {
  assert.equal(NEUD_KEY_FILL_SOURCE_CONTRACT.channelOrder, "bgra");
  assert.equal(NEUD_KEY_FILL_SOURCE_CONTRACT.alphaMode, "premultiplied");
  assert.equal(VERIFIED_SOURCE_CHANNEL_ORDER, "bgra");
  assert.equal(VERIFIED_SOURCE_ALPHA_MODE, "premultiplied");
});

test("live Chromium alpha fixture exists and probe script uses offscreen paint path", () => {
  const fixture = fs.readFileSync(
    path.join(__dirname, "fixtures/key-fill-alpha-fixture.html"),
    "utf8",
  );
  assert.match(fixture, /rgba\(255, 255, 255, 0\.25\)/);
  assert.match(fixture, /rgba\(255, 255, 255, 0\.5\)/);
  assert.match(fixture, /opacity: 0\.5/);
  assert.match(fixture, /text-shadow/);
  assert.match(fixture, /box-shadow/);
  const probe = fs.readFileSync(path.join(__dirname, "probe-chromium-source-alpha.mjs"), "utf8");
  assert.match(probe, /offscreen:\s*true/);
  assert.match(probe, /toBitmap/);
  assert.match(probe, /normalizeToBgra|normalizePaintBufferToBgra/);
});

test("actual channel order and source alpha representation from live probe when available", () => {
  const probePath = path.join(desktopRoot, "validation-output/key-fill-alpha/live-probe.json");
  if (!fs.existsSync(probePath)) {
    // Run electron probe once if electron binary is present.
    const electronBin = [
      path.join(repoRoot, "node_modules/.bin/electron"),
      path.join(desktopRoot, "node_modules/.bin/electron"),
    ].find((candidate) => fs.existsSync(candidate));
    if (!electronBin) {
      assert.ok(true, "electron not installed — skip live probe assertion");
      return;
    }
    const result = spawnSync(
      electronBin,
      [path.join(__dirname, "probe-chromium-source-alpha.mjs")],
      { encoding: "utf8", timeout: 30000, env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" } },
    );
    if (result.status !== 0) {
      assert.fail(`live Chromium probe failed: ${result.stderr || result.stdout}`);
    }
  }
  const report = JSON.parse(fs.readFileSync(probePath, "utf8"));
  assert.equal(report.normalizedOrder, "bgra");
  assert.equal(report.verifiedAlphaMode, "premultiplied");
  assert.ok(report.samples.transparent.a <= 2, "0% alpha");
  assert.ok(Math.abs(report.samples.a25.a - 64) <= 8, `25% alpha got ${report.samples.a25.a}`);
  assert.ok(Math.abs(report.samples.a50.a - 128) <= 8, `50% alpha got ${report.samples.a50.a}`);
  assert.ok(Math.abs(report.samples.a75.a - 191) <= 10, `75% alpha got ${report.samples.a75.a}`);
  assert.ok(report.samples.a100.a >= 250, "100% alpha");
  assert.equal(inferAlphaModeFromSample(report.samples.a50), "premultiplied");
  // Premultiplied: 50% white has RGB ≈ alpha (not ≈255)
  assert.ok(Math.abs(report.samples.a50.r - report.samples.a50.a) <= 8, "50% white RGB≈A when premul");
  assert.ok(report.samples.red.r >= 250 && report.samples.red.b <= 5, "channel order BGRA (opaque red)");
  assert.ok(report.samples.blue.b >= 250 && report.samples.blue.r <= 5, "channel order BGRA (opaque blue)");
});

test("source immutability across Fill and Key generation", () => {
  const source = pixel(255, 128, 64, 200);
  const snapshot = Uint8Array.from(source);
  const fill = new Uint8Array(4);
  const key = new Uint8Array(4);
  generateFillFramePremultiplied(source, fill);
  generateKeyFrame(source, key, "whiteOnBlack");
  assert.deepEqual([...source], [...snapshot]);
  const preserved = preserveSourceFrame(source);
  compositeFillOverBlack(source);
  assert.deepEqual([...source], [...preserved]);
});

test("Fill and Key generation + polarity", () => {
  const source = pixel(255, 0, 0, 64);
  const fill = new Uint8Array(4);
  const key = new Uint8Array(4);
  const keyInv = new Uint8Array(4);
  generateFillFramePremultiplied(source, fill);
  generateKeyFrame(source, key, "whiteOnBlack");
  generateKeyFrame(source, keyInv, "blackOnWhite");
  expectPixel(fill, 0, { r: scaleChannelByAlpha(255, 64), g: 0, b: 0, a: 64 }, "fill 25% red");
  expectPixel(key, 0, { r: 64, g: 64, b: 64, a: 255 }, "key normal");
  expectPixel(keyInv, 0, { r: 191, g: 191, b: 191, a: 255 }, "key inverted");
  assert.equal(keyLumaFromAlphaPolarity(64, "whiteOnBlack"), 64);
  assert.equal(keyLumaFromAlphaPolarity(64, "blackOnWhite"), 191);
});

test("exact pixel-vector suite", () => {
  // Straight → premul generator math (used when sourceAlphaMode === "straight").
  const straightCases = [
    { name: "opaque white", src: [255, 255, 255, 255], fill: [255, 255, 255, 255], key: 255 },
    { name: "50% white straight", src: [255, 255, 255, 128], fill: [128, 128, 128, 128], key: 128 },
    { name: "25% red straight", src: [255, 0, 0, 64], fill: [64, 0, 0, 64], key: 64 },
    { name: "transparent", src: [255, 128, 64, 0], fill: [0, 0, 0, 0], key: 0 },
    { name: "opaque black", src: [0, 0, 0, 255], fill: [0, 0, 0, 255], key: 255 },
    { name: "alpha 1", src: [255, 255, 255, 1], fill: [1, 1, 1, 1], key: 1 },
    { name: "alpha 127", src: [255, 255, 255, 127], fill: [127, 127, 127, 127], key: 127 },
    { name: "alpha 128", src: [255, 255, 255, 128], fill: [128, 128, 128, 128], key: 128 },
    { name: "alpha 254", src: [255, 255, 255, 254], fill: [254, 254, 254, 254], key: 254 },
    { name: "75% white straight", src: [255, 255, 255, 191], fill: [191, 191, 191, 191], key: 191 },
  ];
  for (const item of straightCases) {
    const source = pixel(...item.src);
    const fill = new Uint8Array(4);
    const key = new Uint8Array(4);
    generateFillFramePremultiplied(source, fill);
    generateKeyFrame(source, key, "whiteOnBlack");
    expectPixel(
      fill,
      0,
      { r: item.fill[0], g: item.fill[1], b: item.fill[2], a: item.fill[3] },
      item.name,
    );
    expectPixel(key, 0, { r: item.key, g: item.key, b: item.key, a: 255 }, `${item.name} key`);
  }

  // Verified Chromium premul sources: Fill is a copy.
  const premul = createKeyFillFramePair(pixel(128, 128, 128, 128), {
    frameNumber: 0,
    displayTime: 0,
    displayDuration: 1001,
    timeScale: 60000,
    width: 1,
    height: 1,
    sourceAlphaMode: "premultiplied",
  });
  assert.equal(premul.ok, true);
  expectPixel(premul.pair.fill, 0, { r: 128, g: 128, b: 128, a: 128 }, "premul fill copy");
  expectPixel(premul.pair.key, 0, { r: 128, g: 128, b: 128, a: 255 }, "premul key");
});

test("software downstream composition over multiple backgrounds", () => {
  const backgrounds = [
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 255, b: 255 },
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 255, b: 0 },
    { r: 0, g: 0, b: 255 },
    { r: 128, g: 128, b: 128 },
  ];
  // Chromium-like premultiplied sources (verified contract).
  const sources = [
    pixel(255, 255, 255, 255),
    pixel(128, 128, 128, 128),
    pixel(64, 0, 0, 64),
  ];
  for (const source of sources) {
    const pair = createKeyFillFramePair(source, {
      frameNumber: 1,
      displayTime: 0,
      displayDuration: 1001,
      timeScale: 60000,
      width: 1,
      height: 1,
      sourceAlphaMode: "premultiplied",
    });
    assert.equal(pair.ok, true);
    // Fill must be a copy of premul source (no second multiply).
    assert.deepEqual([...pair.pair.fill], [...source]);
    for (const bg of backgrounds) {
      const viaKeyFill = new Uint8Array(4);
      const reference = new Uint8Array(4);
      compositePremultipliedFillOverBackground(pair.pair.fill, pair.pair.key, bg, viaKeyFill);
      // Reference: same equation using source alpha directly.
      const a = (source[3] ?? 0) / 255;
      reference[0] = Math.round((source[0] ?? 0) + bg.b * (1 - a));
      reference[1] = Math.round((source[1] ?? 0) + bg.g * (1 - a));
      reference[2] = Math.round((source[2] ?? 0) + bg.r * (1 - a));
      reference[3] = 255;
      const out = readBgraPixel(viaKeyFill, 0);
      const ref = readBgraPixel(reference, 0);
      assert.ok(Math.abs(out.r - ref.r) <= 1, `r halo check ${out.r} vs ${ref.r}`);
      assert.ok(Math.abs(out.g - ref.g) <= 1, `g halo check`);
      assert.ok(Math.abs(out.b - ref.b) <= 1, `b halo check`);
    }
  }
});

test("anti-aliased edge and soft shadow vectors reconstruct without halos", () => {
  // Premultiplied white edge ramp (mirrors Chromium partial-alpha edges).
  const width = 8;
  const height = 1;
  const source = new Uint8Array(width * height * 4);
  const alphas = [0, 32, 64, 96, 128, 192, 224, 255];
  for (let x = 0; x < width; x += 1) {
    const a = alphas[x];
    writeStraightBgraPixel(source, x * 4, { r: a, g: a, b: a, a });
  }
  const pair = createKeyFillFramePair(source, {
    frameNumber: 2,
    displayTime: 1001,
    displayDuration: 1001,
    timeScale: 60000,
    width,
    height,
    sourceAlphaMode: "premultiplied",
  });
  assert.equal(pair.ok, true);
  for (const bg of [
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 255, b: 255 },
    { r: 0, g: 128, b: 255 },
  ]) {
    const viaKeyFill = new Uint8Array(source.length);
    compositePremultipliedFillOverBackground(pair.pair.fill, pair.pair.key, bg, viaKeyFill);
    for (let i = 0; i < source.length; i += 4) {
      const a = (source[i + 3] ?? 0) / 255;
      const expectedR = Math.round((source[i + 2] ?? 0) + bg.r * (1 - a));
      const expectedG = Math.round((source[i + 1] ?? 0) + bg.g * (1 - a));
      const expectedB = Math.round((source[i] ?? 0) + bg.b * (1 - a));
      const out = readBgraPixel(viaKeyFill, i);
      assert.ok(Math.abs(out.r - expectedR) <= 1);
      assert.ok(Math.abs(out.g - expectedG) <= 1);
      assert.ok(Math.abs(out.b - expectedB) <= 1);
    }
  }

  // Soft shadow: semi-transparent black (already premul)
  const shadow = pixel(0, 0, 0, 128);
  const shadowPair = createKeyFillFramePair(shadow, {
    frameNumber: 3,
    displayTime: 2002,
    displayDuration: 1001,
    timeScale: 60000,
    width: 1,
    height: 1,
    sourceAlphaMode: "premultiplied",
  });
  assert.equal(shadowPair.ok, true);
  expectPixel(shadowPair.pair.fill, 0, { r: 0, g: 0, b: 0, a: 128 }, "shadow fill");
  expectPixel(shadowPair.pair.key, 0, { r: 128, g: 128, b: 128, a: 255 }, "shadow key");
  const overWhite = new Uint8Array(4);
  compositePremultipliedFillOverBackground(
    shadowPair.pair.fill,
    shadowPair.pair.key,
    { r: 255, g: 255, b: 255 },
    overWhite,
  );
  // 255 * (1 - 128/255) rounds to 127 with integer channel math.
  expectPixel(overWhite, 0, { r: 127, g: 127, b: 127, a: 255 }, "shadow over white");
});

test("CSS opacity / rgba semantics match verified premultiplied paint", () => {
  // Live Chromium: rgba(255,255,255,0.5) → premul RGB≈128 A≈128
  assert.equal(inferAlphaModeFromSample({ r: 128, g: 128, b: 128, a: 128 }), "premultiplied");
  assert.equal(inferAlphaModeFromSample({ r: 64, g: 64, b: 64, a: 64 }), "premultiplied");
  // Classifier still recognizes synthetic straight samples
  assert.equal(inferAlphaModeFromSample({ r: 255, g: 255, b: 255, a: 128 }), "straight");
});

test("Fill/Key same source frame identity and timing metadata", () => {
  const source = new Uint8Array(16);
  for (let i = 0; i < 4; i += 1) writeStraightBgraPixel(source, i * 4, { r: 200, g: 100, b: 50, a: 180 });
  const result = createKeyFillFramePair(source, {
    frameNumber: 9,
    displayTime: 9009,
    displayDuration: 1001,
    timeScale: 60000,
    width: 2,
    height: 2,
    sourceRevision: 42,
  });
  assert.equal(result.ok, true);
  assert.equal(result.pair.frameNumber, 9);
  assert.equal(result.pair.displayTime, 9009);
  assert.equal(result.pair.displayDuration, 1001);
  assert.equal(result.pair.timeScale, 60000);
  assert.equal(result.pair.sourceRevision, 42);
  assert.equal(result.pair.fill.length, result.pair.key.length);
  assert.equal(result.pair.fill.length, result.pair.source.length);
  const diag = diagnosticsFromPair(result.pair);
  assert.equal(diag.sourceFrameFormat, "bgra8");
  assert.equal(diag.fillAlphaRepresentation, "premultiplied");
  assert.equal(diag.framePairNumber, 9);
  assert.ok(typeof diag.frameProcessingMs === "number");
});

test("atomic pair failure does not schedule a partial pair", () => {
  const session = new KeyFillSession({ prerollFrames: 3, frameDuration: 1001, timeScale: 60000 });
  const bad = session.processAndScheduleSourceFrame({
    sourceBgra: new Uint8Array(4), // too short for 2x2
    width: 2,
    height: 2,
    frameNumber: 0,
    displayTime: 0,
  });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Key \+ Fill frame processing failed/);
  assert.equal(session.diagnostics().outstanding.length, 0);

  const source = pixel(10, 20, 30, 40);
  const ok = session.processAndScheduleSourceFrame({
    sourceBgra: source,
    width: 1,
    height: 1,
    frameNumber: 0,
    displayTime: 0,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.frame.pair?.frameNumber, 0);
  assert.equal(ok.frame.fillScheduled, true);
  assert.equal(ok.frame.keyScheduled, true);
});

test("mock paired scheduling keeps Fill/Key associated through preroll and completion", () => {
  const session = new KeyFillSession({ prerollFrames: 3, frameDuration: 1001, timeScale: 60000 });
  const plan = session.planPreroll();
  for (const step of plan) {
    const source = pixel(255, 255, 255, 200);
    const scheduled = session.processAndScheduleSourceFrame({
      sourceBgra: source,
      width: 1,
      height: 1,
      frameNumber: step.frameNumber,
      displayTime: step.displayTime,
    });
    assert.equal(scheduled.ok, true);
    assert.equal(scheduled.pair.displayTime, step.displayTime);
    assert.equal(scheduled.pair.frameNumber, step.frameNumber);
    assert.equal(scheduled.frame.pair?.fill.length, 4);
    assert.equal(scheduled.frame.pair?.key.length, 4);
  }
  session.markFillCompleted(0, "completed");
  session.markKeyCompleted(0, "completed");
  assert.equal(session.syncFaultCount, 0);
  session.markFillCompleted(1, "completed");
  session.markKeyCompleted(1, "late");
  assert.equal(session.syncFaultCount, 1);
});

test("Fill-only black composite uses premul-over-black and stays separate from Key+Fill", () => {
  const premul = pixel(128, 128, 128, 128);
  const fillOnly = compositeFillOverBlack(premul);
  expectPixel(fillOnly, 0, { r: 128, g: 128, b: 128, a: 255 }, "fill-only over black");
  const pair = createKeyFillFramePair(premul, {
    frameNumber: 0,
    displayTime: 0,
    displayDuration: 1001,
    timeScale: 60000,
    width: 1,
    height: 1,
    sourceAlphaMode: "premultiplied",
  });
  assert.equal(pair.ok, true);
  // Key+Fill Fill keeps source alpha; Fill-only forces opaque after black composite.
  assert.equal(readBgraPixel(pair.pair.fill, 0).a, 128);
  assert.equal(readBgraPixel(fillOnly, 0).a, 255);
  assert.deepEqual([...pair.pair.fill], [...premul]);
  assert.deepEqual([...premul], [128, 128, 128, 128]);
});

test("Key + Fill still unavailable on UltraStudio HD Mini capability mapping", () => {
  const caps = mapDeckLinkCapabilitiesToExternal(
    { numberOfSubDevices: 1, physicalKeyFillCandidate: false, supportsExternalKeying: true },
    { siblingPortCount: 1 },
  );
  assert.equal(caps.keyFill, false);
  assert.deepEqual(availablePresentationModes(caps), ["fill"]);
});

test("operator terminology and debug export stay out of normal UI", () => {
  const manager = fs.readFileSync(
    path.join(repoRoot, "src/components/output/OutputManager.tsx"),
    "utf8",
  );
  const labels = fs.readFileSync(
    path.join(repoRoot, "src/lib/output/output-adapter-labels.ts"),
    "utf8",
  );
  assert.match(labels, /External Device/);
  assert.match(manager, /adapterTypeToOperatorLabel/);
  assert.match(manager, /Key \+ Fill/);
  assert.doesNotMatch(manager, /BMDKeyerMode|premultiplied|source\.png|key\.png/);
  const exportUtil = fs.readFileSync(
    path.join(__dirname, "probe-chromium-source-alpha.mjs"),
    "utf8",
  );
  assert.match(exportUtil, /NEUD_KEY_FILL_DEBUG_EXPORT/);
  assert.match(exportUtil, /source\.png/);
  assert.match(exportUtil, /fill\.png/);
  assert.match(exportUtil, /key\.png/);
});

test("processor boundary is generic TypeScript (not DeckLink-specific)", () => {
  const processor = fs.readFileSync(
    path.join(desktopRoot, "src/output/key-fill-processor.ts"),
    "utf8",
  );
  assert.match(processor, /device pixel-format encoder|YUV encoder/i);
  assert.doesNotMatch(processor, /IDeckLink|BMDPixelFormat|DeckLinkKeyer/);
  assert.match(processor, /createKeyFillFramePair/);
});

test("performance budget: 720p / 1080p / 4K conversion fraction of frame interval", () => {
  const results = [
    benchmarkKeyFillProcessing({ width: 1280, height: 720, iterations: 10 }),
    benchmarkKeyFillProcessing({ width: 1920, height: 1080, iterations: 8 }),
    benchmarkKeyFillProcessing({ width: 3840, height: 2160, iterations: 4 }),
  ];
  const hd720 = results[0];
  const hd1080 = results[1];
  const uhd = results[2];
  // 59.94 interval ≈ 16.68ms. TS typed loops should leave headroom at HD.
  assert.ok(hd720.bothMsPerFrame < 12, `720p both=${hd720.bothMsPerFrame.toFixed(2)}ms`);
  assert.ok(hd1080.bothMsPerFrame < 20, `1080p both=${hd1080.bothMsPerFrame.toFixed(2)}ms`);
  // 4K is reported for planning; native conversion likely required before 59.94 4K.
  assert.ok(uhd.bothMsPerFrame > 0, "4K benchmark produced a sample");
  const outDir = path.join(desktopRoot, "validation-output/key-fill-alpha");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "benchmark.json"), JSON.stringify(results, null, 2));
  console.log("[key-fill-signal] benchmark", JSON.stringify(results.map((r) => ({
    size: `${r.width}x${r.height}`,
    bothMsPerFrame: Number(r.bothMsPerFrame.toFixed(3)),
    fillMsPerFrame: Number(r.fillMsPerFrame.toFixed(3)),
    keyMsPerFrame: Number(r.keyMsPerFrame.toFixed(3)),
  }))));
});
