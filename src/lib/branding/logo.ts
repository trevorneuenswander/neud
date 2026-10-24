/**
 * Public NEUD brand mark paths.
 * Canonical artwork source: desktop/assets/icon.png (v0.3.0 application icon).
 * Version query params bust aggressive favicon / CDN caches after deploy.
 */
export const NEUD_ICON_ASSET_VERSION = "0.3.1";

const v = NEUD_ICON_ASSET_VERSION;

/**
 * Primary UI brand mark (128×128, derived from desktop/assets/icon.png).
 * Full-resolution copy remains at `/branding/neud-icon.png`.
 */
export const NEUD_ICON_PATH = `/branding/neud-icon-128.png?v=${v}`;

/** Compact mark for cards and dense UI. */
export const NEUD_ICON_192_PATH = `/branding/neud-icon-192.png?v=${v}`;

/** Open Graph / social preview image (512×512). */
export const NEUD_OG_IMAGE_PATH = `/branding/neud-og.png?v=${v}`;

/** @deprecated Prefer NEUD_ICON_PATH — kept for callers expecting a logo path name. */
export const NEUD_LOGO_PATH = NEUD_ICON_PATH;
