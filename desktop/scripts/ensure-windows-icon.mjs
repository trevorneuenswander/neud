#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(desktopRoot, "build");
const assetsDir = path.join(desktopRoot, "assets");
const pngPath = path.join(assetsDir, "icon.png");
const buildIcoPath = path.join(buildDir, "icon.ico");
const assetsIcoPath = path.join(assetsDir, "icon.ico");

if (!fs.existsSync(pngPath)) {
  console.error(`Missing ${pngPath}`);
  process.exit(1);
}

fs.mkdirSync(buildDir, { recursive: true });

const pngStat = fs.statSync(pngPath);
const outputs = [buildIcoPath, assetsIcoPath];
const needsRegeneration = outputs.some(
  (outputPath) =>
    !fs.existsSync(outputPath) || fs.statSync(outputPath).mtimeMs < pngStat.mtimeMs,
);

if (!needsRegeneration) {
  console.log(`Using existing ${buildIcoPath}`);
  process.exit(0);
}

const icoBuffer = await pngToIco(pngPath);
for (const outputPath of outputs) {
  fs.writeFileSync(outputPath, icoBuffer);
}
console.log(`Generated Windows icon at ${buildIcoPath}`);
