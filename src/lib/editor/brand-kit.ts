/**
 * Project Brand Kit foundation — colors, fonts, logo asset ids.
 * Not SEMA-hardcoded; projects supply their own kit.
 */

export type BrandColor = {
  id: string;
  name: string;
  value: string;
};

export type BrandFont = {
  id: string;
  name: string;
  family: string;
  weight?: number;
};

export type ProjectBrandKit = {
  projectId: string;
  colors: BrandColor[];
  fonts: BrandFont[];
  /** Project asset ids for logos */
  logoAssetIds: string[];
};

export function createEmptyBrandKit(projectId: string): ProjectBrandKit {
  return {
    projectId,
    colors: [],
    fonts: [],
    logoAssetIds: [],
  };
}

/** Example SEMA kit used as sample data only — not a hard dependency. */
export const SAMPLE_SEMA_BRAND_KIT: Omit<ProjectBrandKit, "projectId"> = {
  colors: [
    { id: "sema-red", name: "SEMA Red", value: "#E31C23" },
    { id: "live-magenta", name: "Live Magenta", value: "#FF2D95" },
    { id: "near-black", name: "Near Black", value: "#121212" },
  ],
  fonts: [
    { id: "sema-sans", name: "SEMA Sans", family: "Helvetica Neue, Helvetica, Arial, sans-serif", weight: 700 },
  ],
  logoAssetIds: [],
};

export function mergeBrandKit(
  projectId: string,
  partial?: Partial<ProjectBrandKit> | null,
): ProjectBrandKit {
  const base = createEmptyBrandKit(projectId);
  if (!partial) return base;
  return {
    projectId,
    colors: Array.isArray(partial.colors) ? partial.colors : base.colors,
    fonts: Array.isArray(partial.fonts) ? partial.fonts : base.fonts,
    logoAssetIds: Array.isArray(partial.logoAssetIds)
      ? partial.logoAssetIds
      : base.logoAssetIds,
  };
}
