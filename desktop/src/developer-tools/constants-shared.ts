export const MAX_SCRAPER_SOURCE_BYTES = 512 * 1024;
export const MAX_DISPLAY_SOURCE_BYTES = 256 * 1024;

export const PROHIBITED_SCRAPER_IMPORTS = [
  "electron",
  "child_process",
  "fs",
  "fs/promises",
  "node:fs",
  "node:child_process",
  "@supabase/supabase-js",
];

export const ALLOWED_SCRAPER_DEPENDENCIES = ["puppeteer", "puppeteer-core"];

export const PROHIBITED_DISPLAY_PATTERNS = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\brequire\s*\(/,
  /\bprocess\b/,
  /\belectron\b/i,
  /\bipcRenderer\b/,
  /\bchild_process\b/,
  /\bdocument\.cookie\b/,
  /\bwindow\.opener\b/,
  /\bparent\.document\b/,
  /\btop\.location\b/,
];

export const DISPLAY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const RESERVED_DISPLAY_SLUGS = new Set([
  "api",
  "settings",
  "developer-tools",
  "engine-health",
  "controller",
  "displays",
  "projects",
  "dashboard",
  "login",
  "data-engines",
  "activity",
  "workers",
]);
