import type { EditableGraphicSchema } from "./editable-graphic-types";

export const COMMON_EDITOR_FONTS = [
  "Helvetica Neue",
  "Helvetica",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Tahoma",
  "Impact",
  "system-ui",
  "sans-serif",
  "serif",
  "monospace",
];

export type FontUsage = {
  family: string;
  missing: boolean;
  fallback?: string;
};

function primaryFamily(fontFamily: string): string {
  return fontFamily.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") ?? fontFamily;
}

export function collectFontFamilies(schema: EditableGraphicSchema): string[] {
  const set = new Set<string>();
  for (const layer of schema.layers) {
    if (layer.style?.fontFamily) {
      set.add(primaryFamily(layer.style.fontFamily));
    }
  }
  for (const style of schema.textStyles ?? []) {
    set.add(primaryFamily(style.fontFamily));
  }
  for (const font of schema.brandKit?.fonts ?? []) {
    set.add(primaryFamily(font.family));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function isFontAvailable(family: string, available: string[]): boolean {
  const primary = primaryFamily(family);
  if (available.includes(primary)) return true;
  const lower = primary.toLowerCase();
  return available.some((entry) => entry.toLowerCase() === lower);
}

export function analyzeFonts(
  schema: EditableGraphicSchema,
  available: string[] = COMMON_EDITOR_FONTS,
  fallbacks: Record<string, string> = schema.fontFallbacks ?? {},
): FontUsage[] {
  return collectFontFamilies(schema).map((family) => {
    const missing = !isFontAvailable(family, available);
    return {
      family,
      missing,
      fallback: fallbacks[family],
    };
  });
}

export function resolveFontFamily(
  requested: string,
  fallbacks: Record<string, string>,
  available: string[] = COMMON_EDITOR_FONTS,
): { css: string; missing: boolean; usedFallback: string | null } {
  const primary = primaryFamily(requested);
  if (isFontAvailable(primary, available)) {
    return { css: requested, missing: false, usedFallback: null };
  }
  const mapped = fallbacks[primary];
  if (mapped && isFontAvailable(mapped, available)) {
    return {
      css: requested.replace(primary, mapped),
      missing: true,
      usedFallback: mapped,
    };
  }
  return {
    css: `${requested}, Helvetica Neue, Helvetica, Arial, sans-serif`,
    missing: true,
    usedFallback: "Helvetica Neue",
  };
}
