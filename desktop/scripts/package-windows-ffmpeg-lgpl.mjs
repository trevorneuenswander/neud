#!/usr/bin/env node
/**
 * Stage redistributable LGPL FFmpeg shared libraries next to the Windows video addon.
 *
 * Requires:
 *   NEUD_WITH_FFMPEG=1
 *   FFMPEG_DIR=/path/to/lgpl-shared-ffmpeg  (include/, lib/, bin/*.dll)
 *
 * See docs/licensing/ffmpeg-lgpl.md.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ffmpegDir = process.env.FFMPEG_DIR || "";
const destDir = path.join(desktopRoot, "dist", "platform", "windows", "ffmpeg");

if (process.env.NEUD_WITH_FFMPEG !== "1") {
  console.log("[ffmpeg] NEUD_WITH_FFMPEG!=1 — skipping LGPL DLL staging.");
  process.exit(0);
}

if (!ffmpegDir || !fs.existsSync(ffmpegDir)) {
  console.error("[ffmpeg] FFMPEG_DIR is required and must exist when NEUD_WITH_FFMPEG=1.");
  process.exit(1);
}

const required = ["avcodec", "avformat", "avutil", "swscale"];
const binDir = path.join(ffmpegDir, "bin");
fs.mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const name of required) {
  const candidates = [
    path.join(binDir, `${name}-*.dll`),
    path.join(binDir, `${name}.dll`),
    path.join(ffmpegDir, `${name}.dll`),
  ];
  const files = fs.existsSync(binDir)
    ? fs.readdirSync(binDir).filter((file) => file.toLowerCase().startsWith(name) && file.toLowerCase().endsWith(".dll"))
    : [];
  if (files.length === 0) {
    console.error(`[ffmpeg] Missing DLL for ${name} under ${binDir}`);
    process.exit(1);
  }
  for (const file of files) {
    fs.copyFileSync(path.join(binDir, file), path.join(destDir, file));
    copied += 1;
  }
}

const licenseSrc = path.join(ffmpegDir, "LICENSE");
const licenseAlt = path.join(ffmpegDir, "COPYING.LGPLv2.1");
const licenseDest = path.join(destDir, "LICENSE.FFmpeg.txt");
if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, licenseDest);
} else if (fs.existsSync(licenseAlt)) {
  fs.copyFileSync(licenseAlt, licenseDest);
} else {
  console.warn("[ffmpeg] No LICENSE file found beside FFmpeg build — add LGPL text before shipping.");
}

console.log(`[ffmpeg] Staged ${copied} DLL(s) to ${destDir}`);
