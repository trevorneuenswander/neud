export const DEVELOPER_TOOLS_ROLES = ["owner", "admin"] as const;

export type DeveloperToolsRole = (typeof DEVELOPER_TOOLS_ROLES)[number];

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

export const DISPLAY_SOURCE_TYPES = ["built-in", "project-html"] as const;

export type DisplaySourceType = (typeof DISPLAY_SOURCE_TYPES)[number];

export const MAX_SCRAPER_SOURCE_BYTES = 512 * 1024;
export const MAX_DISPLAY_SOURCE_BYTES = 256 * 1024;

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
