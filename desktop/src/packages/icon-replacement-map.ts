/**
 * NEUD v0.3.0 icon replacement map (documentation only).
 *
 * DO NOT replace artwork until Trevor designs and approves the new icon.
 * After approval, replace all surfaces from one canonical master.
 *
 * Windows:
 * - build/icon.ico (installer / shortcuts)
 * - electron-builder win icon configuration in desktop package.json / electron-builder config
 * - BrowserWindow icon via resolveDesktopApplicationIcon()
 *
 * macOS:
 * - build/icon.icns (app bundle / DMG)
 * - electron-builder mac icon configuration
 *
 * Web / portal:
 * - public/favicon.ico (and any .png variants)
 * - apple-touch-icon if present under public/
 * - site.webmanifest / manifest icons if present
 * - Next.js app metadata icons in layout metadata
 *
 * Audit before replace: search for favicon, .ico, .icns, apple-touch, icon.png.
 */
export const NEUD_ICON_REPLACEMENT_MAP_DOCUMENTED = true;
