"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESERVED_DISPLAY_SLUGS = exports.DISPLAY_SLUG_PATTERN = exports.PROHIBITED_DISPLAY_PATTERNS = exports.ALLOWED_SCRAPER_DEPENDENCIES = exports.PROHIBITED_SCRAPER_IMPORTS = exports.MAX_DISPLAY_SOURCE_BYTES = exports.MAX_SCRAPER_SOURCE_BYTES = void 0;
exports.MAX_SCRAPER_SOURCE_BYTES = 512 * 1024;
exports.MAX_DISPLAY_SOURCE_BYTES = 256 * 1024;
exports.PROHIBITED_SCRAPER_IMPORTS = [
    "electron",
    "child_process",
    "fs",
    "fs/promises",
    "node:fs",
    "node:child_process",
    "@supabase/supabase-js",
];
exports.ALLOWED_SCRAPER_DEPENDENCIES = ["puppeteer", "puppeteer-core"];
exports.PROHIBITED_DISPLAY_PATTERNS = [
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
exports.DISPLAY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
exports.RESERVED_DISPLAY_SLUGS = new Set([
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
