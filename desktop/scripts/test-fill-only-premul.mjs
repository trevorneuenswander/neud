/**
 * Fill-only premultiplied-over-black correctness (Phase 2B.2A follow-up).
 *
 * Historical bug (proven before the fix):
 *   old: RGBout = round(RGBpremul × A/255)  → 50% white 128 → 64 (double premul)
 *   new: RGBout = RGBpremul; Aout = 255      → 50% white stays 128
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  compositeFillOverBlack,
  compositePremultipliedOverOpaqueBackground,
} from "../src/output/decklink-model.ts";
import {
  NEUD_KEY_FILL_SOURCE_CONTRACT,
  createKeyFillFramePair,
  readBgraPixel,
} from "../src/output/key-fill-processor.ts";
import { VERIFIED_SOURCE_ALPHA_MODE } from "../src/output/source-alpha-analysis.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..");

/** Documented pre-fix formula for regression evidence. */
function oldDoublePremultiplyOverBlack(bgra) {
  const out = new Uint8Array(bgra.length);
  for (let i = 0; i + 3 < bgra.length; i += 4) {
    const alpha = (bgra[i + 3] ?? 0) / 255;
    out[i] = Math.round((bgra[i] ?? 0) * alpha);
    out[i + 1] = Math.round((bgra[i + 1] ?? 0) * alpha);
    out[i + 2] = Math.round((bgra[i + 2] ?? 0) * alpha);
    out[i + 3] = 255;
  }
  return out;
}

function bgra(b, g, r, a) {
  return Uint8Array.from([b, g, r, a]);
}

test("verified premultiplied source contract still holds", () => {
  assert.equal(VERIFIED_SOURCE_ALPHA_MODE, "premultiplied");
  assert.equal(NEUD_KEY_FILL_SOURCE_CONTRACT.alphaMode, "premultiplied");
});

test("historical bug: old formula double-premultiplies 50% white to ~64", () => {
  const source = bgra(128, 128, 128, 128);
  const oldOut = oldDoublePremultiplyOverBlack(source);
  assert.deepEqual([...oldOut], [64, 64, 64, 255]);
});

test("opaque white over black", () => {
  const out = compositeFillOverBlack(bgra(255, 255, 255, 255));
  assert.deepEqual([...out], [255, 255, 255, 255]);
});

test("50% white over black keeps premul luminance", () => {
  const source = bgra(128, 128, 128, 128);
  const out = compositeFillOverBlack(source);
  assert.deepEqual([...out], [128, 128, 128, 255]);
  assert.notDeepEqual([...out], [...oldDoublePremultiplyOverBlack(source)]);
});

test("25% red over black", () => {
  const out = compositeFillOverBlack(bgra(0, 0, 64, 64));
  assert.deepEqual([...out], [0, 0, 64, 255]);
});

test("alpha boundary vectors", () => {
  assert.deepEqual([...compositeFillOverBlack(bgra(1, 1, 1, 1))], [1, 1, 1, 255]);
  assert.deepEqual([...compositeFillOverBlack(bgra(127, 127, 127, 127))], [127, 127, 127, 255]);
  assert.deepEqual([...compositeFillOverBlack(bgra(128, 128, 128, 128))], [128, 128, 128, 255]);
  assert.deepEqual([...compositeFillOverBlack(bgra(254, 254, 254, 254))], [254, 254, 254, 255]);
});

test("alpha 0 forces black even with residual RGB", () => {
  assert.deepEqual([...compositeFillOverBlack(bgra(10, 20, 30, 0))], [0, 0, 0, 255]);
});

test("opaque black unchanged", () => {
  assert.deepEqual([...compositeFillOverBlack(bgra(0, 0, 0, 255))], [0, 0, 0, 255]);
});

test("opaque graphics are byte-identical through compositor", () => {
  const solid = new Uint8Array(64);
  for (let i = 0; i < 16; i += 1) {
    solid[i * 4] = 40;
    solid[i * 4 + 1] = 80;
    solid[i * 4 + 2] = 200;
    solid[i * 4 + 3] = 255;
  }
  const out = compositeFillOverBlack(solid);
  for (let i = 0; i < 16; i += 1) {
    assert.equal(out[i * 4], 40);
    assert.equal(out[i * 4 + 1], 80);
    assert.equal(out[i * 4 + 2], 200);
    assert.equal(out[i * 4 + 3], 255);
  }
});

test("source buffer immutability", () => {
  const source = bgra(128, 64, 32, 200);
  const snapshot = Uint8Array.from(source);
  compositeFillOverBlack(source);
  compositePremultipliedOverOpaqueBackground(source, { r: 255, g: 0, b: 0 });
  assert.deepEqual([...source], [...snapshot]);
});

test("generic premul src-over over colored opaque background", () => {
  // 50% premul white over red: Cout = 128 + 255*(1-128/255) for R; G/B = 0 + 0*(...) wait
  // white premul 128,128,128,128 over bg red (255,0,0):
  // R = 128 + 255*(127/255) = 128+127 = 255
  // G = 128 + 0 = 128
  // B = 128 + 0 = 128
  const out = compositePremultipliedOverOpaqueBackground(bgra(128, 128, 128, 128), {
    r: 255,
    g: 0,
    b: 0,
  });
  assert.deepEqual([...out], [128, 128, 255, 255]);
});

test("anti-aliased / shadow / css / rgba vectors reconstruct over black", () => {
  const samples = [
    ["edge", bgra(220, 220, 220, 220)],
    ["shadow", bgra(10, 5, 0, 106)],
    ["css opacity", bgra(128, 128, 128, 128)],
    ["rgba 75%", bgra(191, 191, 191, 191)],
    ["colored text edge", bgra(80, 40, 200, 200)],
  ];
  for (const [label, source] of samples) {
    const out = compositeFillOverBlack(source);
    assert.equal(out[0], source[0], `${label} b`);
    assert.equal(out[1], source[1], `${label} g`);
    assert.equal(out[2], source[2], `${label} r`);
    assert.equal(out[3], 255, `${label} a`);
  }
});

test("native FitCompositeFill no longer multiplies RGB by alpha", () => {
  const sdk = fs.readFileSync(
    path.join(desktopRoot, "native/decklink/decklink-sdk.cc"),
    "utf8",
  );
  assert.match(sdk, /WritePremultipliedOverBlackPixel/);
  assert.match(sdk, /Cout = Cpremul/);
  // Old double-premul pattern should not remain in FitCompositeFill body.
  assert.doesNotMatch(
    sdk,
    /dstLine\[index\] = static_cast<uint8_t>\(\(srcLine\[index\] \* alpha\) \/ 255\)/,
  );
});

test("Key + Fill semantic pipeline unchanged", () => {
  const source = bgra(128, 128, 128, 128);
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
  assert.deepEqual([...pair.pair.fill], [128, 128, 128, 128]);
  assert.equal(readBgraPixel(pair.pair.key, 0).r, 128);
});

test("performance: premul-over-black is cheap at HD", () => {
  const sizes = [
    [1280, 720],
    [1920, 1080],
    [3840, 2160],
  ];
  const results = [];
  for (const [width, height] of sizes) {
    const bytes = width * height * 4;
    const source = new Uint8Array(bytes);
    for (let i = 0; i + 3 < bytes; i += 4) {
      source[i] = 128;
      source[i + 1] = 128;
      source[i + 2] = 128;
      source[i + 3] = 128;
    }
    const iterations = width >= 3840 ? 3 : 8;
    const oldStart = performance.now();
    for (let n = 0; n < iterations; n += 1) oldDoublePremultiplyOverBlack(source);
    const oldMs = (performance.now() - oldStart) / iterations;
    const newStart = performance.now();
    for (let n = 0; n < iterations; n += 1) compositeFillOverBlack(source);
    const newMs = (performance.now() - newStart) / iterations;
    results.push({ width, height, oldMsPerFrame: oldMs, newMsPerFrame: newMs });
  }
  const outDir = path.join(desktopRoot, "validation-output/key-fill-alpha");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "fill-only-premul-benchmark.json"), JSON.stringify(results, null, 2));
  console.log("[fill-only-premul] benchmark", JSON.stringify(results.map((r) => ({
    size: `${r.width}x${r.height}`,
    old: Number(r.oldMsPerFrame.toFixed(3)),
    neu: Number(r.newMsPerFrame.toFixed(3)),
  }))));
  assert.ok(results[0].newMsPerFrame < 12);
  assert.ok(results[1].newMsPerFrame < 20);
});

test("Chromium black-reference comparison via live probe when available", () => {
  const probePath = path.join(desktopRoot, "validation-output/key-fill-alpha/live-probe.json");
  const electronBin = [
    path.join(repoRoot, "node_modules/.bin/electron"),
    path.join(desktopRoot, "node_modules/.bin/electron"),
  ].find((candidate) => fs.existsSync(candidate));

  // Rebuild-sensitive: ensure dist has the corrected compositor before probing.
  if (electronBin) {
    const result = spawnSync(
      electronBin,
      [path.join(__dirname, "probe-chromium-source-alpha.mjs")],
      {
        encoding: "utf8",
        timeout: 45000,
        env: {
          ...process.env,
          ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
          NEUD_KEY_FILL_DEBUG_EXPORT: "1",
        },
      },
    );
    if (result.status !== 0) {
      assert.fail(`live probe failed: ${result.stderr || result.stdout}`);
    }
  } else if (!fs.existsSync(probePath)) {
    assert.ok(true, "electron unavailable — skip live Chromium reference");
    return;
  }

  const report = JSON.parse(fs.readFileSync(probePath, "utf8"));
  assert.equal(report.verifiedAlphaMode, "premultiplied");
  assert.ok(report.fillOnlyPremulFix?.comparison, "fill-only comparison missing from probe");
  const cmp = report.fillOnlyPremulFix.comparison;
  // Region centers (solid opacity swatches) should match closely.
  for (const name of ["a25", "a50", "a75", "a100", "transparent"]) {
    assert.ok(
      cmp.regions[name].maxChannelDelta <= 3,
      `${name} delta ${cmp.regions[name].maxChannelDelta}`,
    );
  }
  // Corrected 50% white source stays ~128, not ~64.
  assert.ok(Math.abs(cmp.sourceA50.r - 128) <= 8);
  const fillOnlyPng = path.join(desktopRoot, "validation-output/key-fill-alpha/neud-fill-only-black.png");
  const refPng = path.join(desktopRoot, "validation-output/key-fill-alpha/chromium-reference-black.png");
  const diffPng = path.join(desktopRoot, "validation-output/key-fill-alpha/difference.png");
  assert.ok(fs.existsSync(fillOnlyPng));
  assert.ok(fs.existsSync(refPng));
  assert.ok(fs.existsSync(diffPng));
});
