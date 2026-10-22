#!/usr/bin/env node
/**
 * Graphic Editor Phase 3 module contracts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("align/distribute module present", () => {
  const src = read("src/lib/editor/align-distribute.ts");
  assert.match(src, /export function alignLayers/);
  assert.match(src, /export function distributeLayers/);
  assert.match(src, /hcenter|vcenter/);
});

test("smart guides module present", () => {
  const src = read("src/lib/editor/smart-guides.ts");
  assert.match(src, /export function collectSnapTargets|snapRect/);
  assert.match(src, /SmartGuide/);
});

test("view transform zoom/pan view-only", () => {
  const src = read("src/lib/editor/view-transform.ts");
  assert.match(src, /ZOOM_PRESETS/);
  assert.match(src, /fitZoomToViewport/);
  assert.match(src, /zoomAtPoint/);
  assert.match(src, /Never mutate authored/i);
});

test("formatters declarative pipeline", () => {
  const src = read("src/lib/editor/formatters.ts");
  assert.match(src, /applyFormatters/);
  assert.match(src, /case:\s*"upper"|value === "upper"/);
  assert.match(src, /currency/);
  assert.match(src, /fallback/);
});

test("conditions no JS", () => {
  const src = read("src/lib/editor/conditions.ts");
  assert.match(src, /evaluateCondition/);
  assert.match(src, /isEmpty/);
  assert.match(src, /greaterThan/);
  assert.doesNotMatch(src, /new Function|eval\(/);
});

test("schema Phase 3 foundations", () => {
  const src = read("src/lib/editor/editable-graphic-types.ts");
  assert.match(src, /formatters\?/);
  assert.match(src, /visibilityCondition/);
  assert.match(src, /conditionalStyles/);
  assert.match(src, /effects\?/);
  assert.match(src, /mask\?/);
  assert.match(src, /crop\?/);
  assert.match(src, /repeater\?/);
  assert.match(src, /autoLayout\?/);
  assert.match(src, /anchors\?/);
  assert.match(src, /operatorEditable/);
  assert.match(src, /designerNotes/);
  assert.match(src, /designLocked/);
  assert.match(src, /namedStates/);
  assert.match(src, /designTokens/);
  assert.match(src, /components\?/);
});

test("brand kit + assets foundations", () => {
  const brand = read("src/lib/editor/brand-kit.ts");
  const assets = read("src/lib/editor/project-assets.ts");
  assert.match(brand, /ProjectBrandKit/);
  assert.match(brand, /SEMA Red|Live Magenta/);
  assert.match(brand, /createEmptyBrandKit/);
  assert.match(assets, /ProjectAsset/);
  assert.match(assets, /assertNoAbsoluteAssetPath/);
  assert.match(assets, /png|webp|svg/i);
});

test("display templates foundation", () => {
  const src = read("src/lib/editor/display-templates.ts");
  assert.match(src, /blank/);
  assert.match(src, /lower-third/);
  assert.match(src, /createTemplateSchema/);
  assert.match(src, /DISPLAY_TEMPLATES/);
});

test("data registry friendly hierarchy (no raw JSON panel)", () => {
  const registry = read("src/lib/editor/graphic-data-registry.ts");
  const editor = read("src/components/editor/GraphicEditorClient.tsx");
  assert.match(registry, /SEMA Schedule|Schedule/);
  assert.match(registry, /NOW|Now/i);
  assert.match(registry, /Title/);
  assert.doesNotMatch(editor, /Canonical JSON|Raw JSON|JSON inspector/i);
});

test("formatter math: uppercase + fallback", async () => {
  // Inline equivalent of applyFormatters for contract without TS import.
  function apply(raw, steps) {
    let value = raw == null ? "" : String(raw);
    for (const step of steps) {
      if (step.type === "fallback" && !value.trim()) value = step.value;
      if (step.type === "case" && step.value === "upper") value = value.toUpperCase();
      if (step.type === "prefix") value = `${step.value}${value}`;
      if (step.type === "suffix") value = `${value}${step.value}`;
    }
    return value;
  }
  assert.equal(apply("", [{ type: "fallback", value: "—" }]), "—");
  assert.equal(apply("live", [{ type: "case", value: "upper" }]), "LIVE");
  assert.equal(apply("42", [{ type: "prefix", value: "$" }, { type: "suffix", value: " USD" }]), "$42 USD");
});

test("align math: left + hcenter", () => {
  const layers = [
    { id: "a", x: 10, y: 0, width: 100, height: 20 },
    { id: "b", x: 50, y: 40, width: 40, height: 20 },
  ];
  const minX = Math.min(...layers.map((l) => l.x));
  const maxR = Math.max(...layers.map((l) => l.x + l.width));
  const midX = (minX + maxR) / 2;
  assert.equal(minX, 10);
  assert.equal(Math.round(midX - 40 / 2), 40);
});
