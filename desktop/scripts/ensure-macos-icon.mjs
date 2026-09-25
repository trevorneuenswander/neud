#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(desktopRoot, "build");
const pngPath = path.join(desktopRoot, "assets", "icon.png");
const icnsPath = path.join(buildDir, "icon.icns");

if (!fs.existsSync(pngPath)) {
  console.error(`Missing ${pngPath}`);
  process.exit(1);
}

fs.mkdirSync(buildDir, { recursive: true });

const pngStat = fs.statSync(pngPath);
if (fs.existsSync(icnsPath) && fs.statSync(icnsPath).mtimeMs >= pngStat.mtimeMs) {
  console.log(`Using existing ${icnsPath}`);
  process.exit(0);
}

if (process.platform === "darwin") {
  const iconsetDir = path.join(buildDir, "icon.iconset");
  fs.rmSync(iconsetDir, { recursive: true, force: true });
  fs.mkdirSync(iconsetDir, { recursive: true });

  const sizes = [16, 32, 128, 256, 512];
  for (const size of sizes) {
    execSync(
      `sips -z ${size} ${size} "${pngPath}" --out "${path.join(iconsetDir, `icon_${size}x${size}.png`)}"`,
      { stdio: "inherit" },
    );
    const retina = size * 2;
    execSync(
      `sips -z ${retina} ${retina} "${pngPath}" --out "${path.join(iconsetDir, `icon_${size}x${size}@2x.png`)}"`,
      { stdio: "inherit" },
    );
  }

  execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: "inherit" });
  fs.rmSync(iconsetDir, { recursive: true, force: true });
  console.log(`Generated macOS icon at ${icnsPath}`);
  process.exit(0);
}

if (fs.existsSync(icnsPath)) {
  console.log(`Using committed macOS icon at ${icnsPath}`);
  process.exit(0);
}

console.error(
  "Missing build/icon.icns. On macOS run ensure-macos-icon locally, or commit a generated icon.icns for CI.",
);
process.exit(1);
