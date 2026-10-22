/**
 * Chromium → NEUD source alpha helpers.
 * Verified contract (Phase 2B.2A live offscreen paint probe):
 *   channel order after normalize: BGRA
 *   alpha representation: straight (non-premultiplied)
 * See docs/output-engine/key-fill-alpha-contract.md
 *
 * Fill-only compositing must not mutate the canonical source buffer used for Key + Fill.
 */

export type SourcePixelOrder = "bgra" | "rgba" | "unknown";

export type AlphaSample = {
  label: string;
  /** Expected CSS/source alpha 0–1 */
  expectedAlpha: number;
  offset: number;
};

/** Verified NEUD canonical source after OffscreenOutputRenderer normalize. */
export const VERIFIED_SOURCE_CHANNEL_ORDER: SourcePixelOrder = "bgra";
/** Live probe: rgba()/opacity paints arrive premultiplied (RGB≈α for white). */
export const VERIFIED_SOURCE_ALPHA_MODE = "premultiplied" as const;

/**
 * Preserve an untouched copy of the paint buffer before Fill-only black composite.
 */
export function preserveSourceFrame(source: Uint8Array): Uint8Array {
  return Uint8Array.from(source);
}

export function readPixel(
  buffer: Uint8Array,
  order: SourcePixelOrder,
  byteOffset: number,
): { r: number; g: number; b: number; a: number } {
  const c0 = buffer[byteOffset] ?? 0;
  const c1 = buffer[byteOffset + 1] ?? 0;
  const c2 = buffer[byteOffset + 2] ?? 0;
  const c3 = buffer[byteOffset + 3] ?? 0;
  if (order === "bgra") return { b: c0, g: c1, r: c2, a: c3 };
  if (order === "rgba") return { r: c0, g: c1, b: c2, a: c3 };
  return { r: c0, g: c1, b: c2, a: c3 };
}

/**
 * Classify a sample. Live Chromium probes show straight alpha for rgba()/opacity paints:
 * 50% white keeps RGB≈255 with A≈128 (not RGB≈128).
 */
export function inferAlphaModeFromSample(input: {
  r: number;
  g: number;
  b: number;
  a: number;
}): "straight" | "premultiplied" | "unknown" {
  if (input.a <= 0) return "unknown";
  if (input.a >= 250) return "straight";
  const maxRgb = Math.max(input.r, input.g, input.b);
  const premulExpected = Math.round((255 * input.a) / 255);
  // 50% white straight ≈ RGB 255, a 128; premultiplied ≈ RGB 128, a 128
  if (Math.abs(maxRgb - 255) <= 20 && input.a > 100 && input.a < 160) return "straight";
  if (maxRgb > premulExpected + 30) return "straight";
  if (Math.abs(maxRgb - premulExpected) <= 24) return "premultiplied";
  return "unknown";
}

/** Key plane sample: alpha → grayscale (white-on-black polarity). */
export function keyLumaFromAlpha(alpha: number): number {
  return Math.max(0, Math.min(255, alpha | 0));
}

/** Premultiplied Fill RGB from straight source (exact integer round). */
export function premultiplyStraightRgb(r: number, g: number, b: number, a: number): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  return {
    r: Math.round((r * a) / 255),
    g: Math.round((g * a) / 255),
    b: Math.round((b * a) / 255),
    a,
  };
}
