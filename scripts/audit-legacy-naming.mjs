#!/usr/bin/env node
/**
 * Fails if prohibited legacy HMG naming appears outside approved migration/redirect files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "release",
  "staging",
  ".tmp-bag-default-settings-744ef631",
]);

const ALLOWLIST = new Set([
  "scripts/audit-legacy-naming.mjs",
  "scripts/migrate-local-neud-data.mjs",
  "desktop/src/services/database-rename-migration.ts",
  "desktop/src/services/legacy-settings-migration.ts",
  "desktop/src/services/user-data-migration.ts",
  "src/lib/routing/startup-paths.ts",
  "desktop/src/services/startup-route.ts",
  "desktop/scripts/test-startup-route.mjs",
  "desktop/scripts/test-neud-branding.mjs",
  "desktop/scripts/test-desktop-header-and-dataset.mjs",
  "workers/data-engine/scripts/compare-legacy-hmg-runtime.mjs",
]);

const PATTERNS = [
  { label: "@hmg", regex: /@hmg\b/i },
  { label: "HMG_", regex: /\bHMG_/ },
  { label: "NEXT_PUBLIC_HMG_", regex: /\bNEXT_PUBLIC_HMG_/ },
  { label: "hmg-graphics.sqlite", regex: /hmg-graphics\.sqlite/ },
  { label: "HMG Graphics Server", regex: /HMG Graphics Server/ },
  { label: "hmgDesktop", regex: /\bhmgDesktop\b/ },
  { label: "hmg: IPC", regex: /\bhmg:/ },
  { label: "x-hmg header", regex: /x-hmg/i },
  { label: "X-HMG header", regex: /X-HMG/ },
  { label: "persist:hmg", regex: /persist:hmg/ },
  { label: "hmg-relay", regex: /hmg-relay/ },
  { label: "hmg-local-api", regex: /hmg-local-api/ },
  { label: "HMG_IMPORT", regex: /\bHMG_IMPORT/ },
  { label: "HMG_LOGO", regex: /\bHMG_LOGO/ },
];

const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".sql",
  ".yml",
  ".yaml",
  ".html",
  ".css",
  ".env",
  ".example",
]);

function shouldScanFile(relativePath) {
  if (ALLOWLIST.has(relativePath.replace(/\\/g, "/"))) {
    return false;
  }

  if (relativePath.includes(`${path.sep}logs${path.sep}`)) {
    return false;
  }

  if (relativePath.includes(`${path.sep}runtime-compare${path.sep}`)) {
    return false;
  }

  const ext = path.extname(relativePath);
  if (!SCAN_EXTENSIONS.has(ext) && !relativePath.endsWith(".env.example")) {
    return false;
  }

  return true;
}

function walk(dir, matches = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, matches);
      continue;
    }

    const relativePath = path.relative(repoRoot, fullPath);
    if (!shouldScanFile(relativePath)) {
      continue;
    }

    const source = fs.readFileSync(fullPath, "utf8");
    const lines = source.split(/\r?\n/);

    for (const pattern of PATTERNS) {
      lines.forEach((line, index) => {
        if (pattern.regex.test(line)) {
          matches.push({
            file: relativePath.replace(/\\/g, "/"),
            line: index + 1,
            pattern: pattern.label,
            text: line.trim().slice(0, 160),
          });
        }
      });
    }
  }

  return matches;
}

const violations = walk(repoRoot);

if (violations.length > 0) {
  console.error(`Legacy naming audit failed with ${violations.length} violation(s):\n`);
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line} [${violation.pattern}] ${violation.text}`,
    );
  }
  process.exit(1);
}

console.log("Legacy naming audit passed.");
