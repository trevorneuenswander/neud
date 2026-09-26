#!/usr/bin/env node
/**
 * Prints GitHub Release markdown for the current NEUD release catalog entry.
 * Keeps GitHub Release text aligned with src/lib/releases/neud-releases.ts.
 *
 * Usage: node desktop/scripts/print-github-release-body.mjs [version]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const versionArg = process.argv[2]?.trim();

async function main() {
  const modulePath = path.join(repoRoot, "src/lib/releases/neud-releases.ts");
  if (!fs.existsSync(modulePath)) {
    console.error("Missing release catalog:", modulePath);
    process.exit(1);
  }

  // Next/TSC does not emit this module to dist; evaluate via ts import is not available in CI scripts.
  // Release managers: paste from docs/release-notes-v0.2.2.md or mirror NEUD_RELEASES highlights in GitHub UI.
  const catalogSource = fs.readFileSync(modulePath, "utf8");
  const version =
    versionArg ??
    catalogSource.match(/version: "(\d+\.\d+\.\d+)",[\s\S]*?current: true/)?.[1] ??
    null;

  if (!version) {
    console.error("Could not resolve current release version from catalog.");
    process.exit(1);
  }

  const notesPath = path.join(repoRoot, `docs/release-notes-v${version}.md`);
  if (fs.existsSync(notesPath)) {
    process.stdout.write(fs.readFileSync(notesPath, "utf8"));
    return;
  }

  console.error(
    `No docs/release-notes-v${version}.md found. Update src/lib/releases/neud-releases.ts and add matching release notes doc.`,
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
