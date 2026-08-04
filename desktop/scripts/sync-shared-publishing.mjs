#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourceDir = path.join(repoRoot, "shared", "publishing");
const targetDir = path.join(repoRoot, "desktop", "src", "publishing");
const canonicalPhotoSource = path.join(
  repoRoot,
  "shared",
  "display-runtime",
  "canonical-photo.ts",
);
const canonicalPhotoTarget = path.join(repoRoot, "desktop", "src", "displays", "canonical-photo.ts");

function copyPublishingModule() {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }

    let contents = fs.readFileSync(path.join(sourceDir, entry.name), "utf8");
    if (entry.name === "sanitize.ts") {
      contents = contents.replace(
        '../display-runtime/canonical-photo',
        '../displays/canonical-photo',
      );
    }

    fs.writeFileSync(path.join(targetDir, entry.name), contents, "utf8");
  }
}

function copyCanonicalPhotoModule() {
  fs.copyFileSync(canonicalPhotoSource, canonicalPhotoTarget);
}

copyPublishingModule();
copyCanonicalPhotoModule();
console.log(`Synced shared publishing module to ${targetDir}`);
console.log(`Synced canonical photo module to ${canonicalPhotoTarget}`);
