/**
 * PSD import — practical header + layer-name extraction without Photoshop.
 * Unsupported features are flattened/reported. Heavy effects are not reproduced.
 */

import type { EditableLayer } from "./editable-graphic-types";
import { createEmptyLayer, createLayerId } from "./editable-graphic-types";

export type PsdImportResult = {
  ok: boolean;
  layers: EditableLayer[];
  unsupported: string[];
  message: string;
  canvasWidth?: number;
  canvasHeight?: number;
};

type PsdFixtureLayer = {
  name?: string;
  type?: EditableLayer["type"];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  visible?: boolean;
  opacity?: number;
  text?: string;
  fill?: string;
  group?: boolean;
  children?: PsdFixtureLayer[];
};

type PsdFixture = {
  type: "neud-psd-fixture";
  width?: number;
  height?: number;
  layers?: PsdFixtureLayer[];
};

const DEFAULT_UNSUPPORTED = [
  "layer effects / styles",
  "smart objects",
  "adjustment layers",
  "vector masks",
  "text engine fidelity",
  "blend modes",
  "layer comps",
];

function looksLikePsdBinary(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x38 &&
    bytes[1] === 0x42 &&
    bytes[2] === 0x50 &&
    bytes[3] === 0x53
  );
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function readPascalName(bytes: Uint8Array, offset: number): { name: string; next: number } {
  if (offset >= bytes.length) return { name: "Layer", next: offset };
  const len = bytes[offset] ?? 0;
  const start = offset + 1;
  const end = Math.min(bytes.length, start + len);
  const name = new TextDecoder("latin1").decode(bytes.subarray(start, end)).trim() || "Layer";
  // Pascal string padded to even length including length byte.
  const total = 1 + len + ((1 + len) % 2);
  return { name, next: offset + total };
}

/**
 * Best-effort scan for layer names inside the Layer and Mask Information section.
 * Not a full PSD parser — extracts names/order when the structure is simple enough.
 */
function extractPsdLayerNames(bytes: Uint8Array): {
  width: number;
  height: number;
  names: string[];
} {
  const height = readU32(bytes, 14);
  const width = readU32(bytes, 18);
  const names: string[] = [];
  // Color mode data length at offset 26
  let offset = 26;
  if (offset + 4 > bytes.length) return { width, height, names };
  const colorModeLen = readU32(bytes, offset);
  offset += 4 + colorModeLen;
  if (offset + 4 > bytes.length) return { width, height, names };
  const imageResourcesLen = readU32(bytes, offset);
  offset += 4 + imageResourcesLen;
  if (offset + 4 > bytes.length) return { width, height, names };
  const layerMaskLen = readU32(bytes, offset);
  offset += 4;
  const layerMaskEnd = Math.min(bytes.length, offset + layerMaskLen);
  if (offset + 2 > layerMaskEnd) return { width, height, names };
  const layerInfoLen = readU32(bytes, offset);
  offset += 4;
  if (offset + 2 > layerMaskEnd) return { width, height, names };
  let layerCount = readU16(bytes, offset);
  offset += 2;
  // Negative layer count means the first alpha channel contains the merged result.
  if (layerCount > 0x7fff) layerCount = 0x10000 - layerCount;
  layerCount = Math.min(layerCount, 64);
  for (let i = 0; i < layerCount && offset + 20 < layerMaskEnd; i += 1) {
    // channel count after rect (4×int32)
    offset += 16;
    const channelCount = readU16(bytes, offset);
    offset += 2;
    offset += channelCount * 6; // channel id + length
    // blend mode signature + key
    offset += 12;
    offset += 1; // opacity
    offset += 1; // clipping
    offset += 1; // flags
    offset += 1; // filler
    if (offset + 4 > layerMaskEnd) break;
    const extraLen = readU32(bytes, offset);
    offset += 4;
    const extraEnd = Math.min(layerMaskEnd, offset + extraLen);
    // layer mask + blending ranges skipped; name is near end of extra — scan for pascal
    // Spec: after mask data + blending ranges comes name. Approximate by reading at offset.
    if (offset + 4 <= extraEnd) {
      const maskLen = readU32(bytes, offset);
      let cursor = offset + 4 + maskLen;
      if (cursor + 4 <= extraEnd) {
        const blendLen = readU32(bytes, cursor);
        cursor += 4 + blendLen;
        if (cursor < extraEnd) {
          const { name } = readPascalName(bytes, cursor);
          if (name && name !== "</Layer group>") names.push(name);
        }
      }
    }
    offset = extraEnd;
  }
  return { width, height, names };
}

function fixtureLayerToEditable(layer: PsdFixtureLayer, index: number): EditableLayer[] {
  if (layer.group && Array.isArray(layer.children)) {
    const group = createEmptyLayer("group", {
      id: createLayerId("psd-group"),
      name: layer.name || `Group ${index + 1}`,
      x: layer.x ?? 0,
      y: layer.y ?? 0,
      width: layer.width ?? 400,
      height: layer.height ?? 200,
      visible: layer.visible !== false,
      opacity: typeof layer.opacity === "number" ? layer.opacity : 1,
      zIndex: index,
    });
    const children = layer.children.flatMap((child, childIndex) => {
      const mapped = fixtureLayerToEditable(child, childIndex);
      return mapped.map((entry) => ({ ...entry, parentId: group.id }));
    });
    return [group, ...children];
  }
  const type = layer.type ?? (layer.text ? "text" : "rect");
  return [
    createEmptyLayer(type, {
      id: createLayerId("psd"),
      name: layer.name || `Layer ${index + 1}`,
      x: layer.x ?? 40 + index * 24,
      y: layer.y ?? 40 + index * 24,
      width: layer.width ?? 320,
      height: layer.height ?? (type === "text" ? 64 : 180),
      visible: layer.visible !== false,
      opacity: typeof layer.opacity === "number" ? layer.opacity : 1,
      zIndex: index,
      content: layer.text ? { text: layer.text, textMode: "static" } : {},
      style: layer.fill ? { fill: layer.fill } : {},
    }),
  ];
}

export function parsePsdImport(input: {
  fileName: string;
  text?: string;
  bytes?: Uint8Array;
}): PsdImportResult {
  if (input.bytes && looksLikePsdBinary(input.bytes)) {
    try {
      const { width, height, names } = extractPsdLayerNames(input.bytes);
      if (names.length === 0) {
        return {
          ok: true,
          canvasWidth: width,
          canvasHeight: height,
          layers: [
            createEmptyLayer("rect", {
              id: createLayerId("psd-flat"),
              name: input.fileName.replace(/\.psd$/i, "") || "PSD Flattened",
              x: 0,
              y: 0,
              width: Math.min(width || 1920, 1920),
              height: Math.min(height || 1080, 1080),
              style: { fill: "rgba(40,40,48,0.85)" },
            }),
          ],
          unsupported: [...DEFAULT_UNSUPPORTED, "pixel layer contents (flattened placeholder)"],
          message: `PSD ${width}×${height} imported as flattened placeholder. Unsupported features listed.`,
        };
      }
      const layers = names.map((name, index) =>
        createEmptyLayer("rect", {
          id: createLayerId("psd"),
          name,
          x: 40 + (index % 6) * 40,
          y: 40 + Math.floor(index / 6) * 40,
          width: 280,
          height: 120,
          zIndex: index,
          style: { fill: "rgba(30,30,36,0.9)" },
        }),
      );
      return {
        ok: true,
        canvasWidth: width,
        canvasHeight: height,
        layers,
        unsupported: [...DEFAULT_UNSUPPORTED, "pixel/image payloads (structure + names only)"],
        message: `Parsed ${names.length} PSD layer name(s) from ${width}×${height}. Raster contents not imported — flatten unsupported features.`,
      };
    } catch {
      return {
        ok: false,
        layers: [],
        unsupported: DEFAULT_UNSUPPORTED,
        message: "Unable to parse PSD binary. Use PNG/JPG export or a NEUD PSD fixture JSON.",
      };
    }
  }

  const text = input.text?.trim() ?? "";
  if (!text) {
    return {
      ok: false,
      layers: [],
      unsupported: DEFAULT_UNSUPPORTED,
      message: "Empty PSD import payload.",
    };
  }

  try {
    const parsed = JSON.parse(text) as PsdFixture;
    if (parsed?.type !== "neud-psd-fixture" || !Array.isArray(parsed.layers)) {
      return {
        ok: false,
        layers: [],
        unsupported: DEFAULT_UNSUPPORTED,
        message: "JSON must be a neud-psd-fixture with layers[].",
      };
    }
    const layers = parsed.layers.flatMap((layer, index) => fixtureLayerToEditable(layer, index));
    return {
      ok: true,
      layers,
      canvasWidth: parsed.width,
      canvasHeight: parsed.height,
      unsupported: [],
      message: `Imported ${layers.length} layer(s) from PSD fixture.`,
    };
  } catch {
    return {
      ok: false,
      layers: [],
      unsupported: DEFAULT_UNSUPPORTED,
      message: "Unrecognized PSD import payload.",
    };
  }
}
