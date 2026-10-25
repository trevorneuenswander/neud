#!/usr/bin/env node
/**
 * Stage redistributable LGPL FFmpeg shared libraries next to the Windows video addon.
 *
 * Requires:
 *   NEUD_WITH_FFMPEG=1
 *   FFMPEG_DIR=/path/to/lgpl-shared-ffmpeg  (include/, lib/, bin/*.dll)
 *   — defaults to desktop/vendor/ffmpeg-windows-lgpl/current when unset
 *
 * See docs/licensing/ffmpeg-lgpl.md.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultFfmpegDir = path.join(desktopRoot, "vendor", "ffmpeg-windows-lgpl", "current");
const ffmpegDir = process.env.FFMPEG_DIR || defaultFfmpegDir;
const windowsDir = path.join(desktopRoot, "dist", "platform", "windows");
const destDir = path.join(windowsDir, "ffmpeg");

if (process.env.NEUD_WITH_FFMPEG !== "1") {
  console.log("[ffmpeg] NEUD_WITH_FFMPEG!=1 — skipping LGPL DLL staging.");
  process.exit(0);
}

if (!ffmpegDir || !fs.existsSync(ffmpegDir)) {
  console.error(
    `[ffmpeg] FFMPEG_DIR is required and must exist when NEUD_WITH_FFMPEG=1 (tried ${ffmpegDir}).`,
  );
  process.exit(1);
}

const required = ["avcodec", "avformat", "avutil", "swscale"];
const binDir = path.join(ffmpegDir, "bin");
if (!fs.existsSync(binDir)) {
  console.error(`[ffmpeg] Missing bin/ under ${ffmpegDir}`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.mkdirSync(windowsDir, { recursive: true });

const allDlls = fs
  .readdirSync(binDir)
  .filter((file) => file.toLowerCase().endsWith(".dll"));

for (const name of required) {
  const found = allDlls.some(
    (file) =>
      file.toLowerCase().startsWith(name.toLowerCase()) && file.toLowerCase().endsWith(".dll"),
  );
  if (!found) {
    console.error(`[ffmpeg] Missing DLL for ${name} under ${binDir}`);
    process.exit(1);
  }
}

let copied = 0;
for (const file of allDlls) {
  // Stage beside neud_video.node (Windows DLL search) and under ffmpeg/ for inventory.
  fs.copyFileSync(path.join(binDir, file), path.join(destDir, file));
  fs.copyFileSync(path.join(binDir, file), path.join(windowsDir, file));
  copied += 1;
}

const licenseCandidates = [
  path.join(ffmpegDir, "LICENSE"),
  path.join(ffmpegDir, "LICENSE.txt"),
  path.join(ffmpegDir, "COPYING.LGPLv2.1"),
  path.join(ffmpegDir, "COPYING.LGPLv3"),
];
const licenseDest = path.join(destDir, "LICENSE.FFmpeg.txt");
const licenseSrc = licenseCandidates.find((candidate) => fs.existsSync(candidate));
if (licenseSrc) {
  fs.copyFileSync(licenseSrc, licenseDest);
  fs.copyFileSync(licenseSrc, path.join(windowsDir, "LICENSE.FFmpeg.txt"));
} else {
  console.warn("[ffmpeg] No LICENSE file found beside FFmpeg build — add LGPL text before shipping.");
}

const provenanceSrc = path.join(ffmpegDir, "NEUD-FFMPEG-PROVENANCE.txt");
if (fs.existsSync(provenanceSrc)) {
  fs.copyFileSync(provenanceSrc, path.join(destDir, "NEUD-FFMPEG-PROVENANCE.txt"));
  fs.copyFileSync(provenanceSrc, path.join(windowsDir, "NEUD-FFMPEG-PROVENANCE.txt"));
}

const sourceOffer = [
  "NEUD redistributes FFmpeg shared libraries under LGPL 2.1+.",
  "Corresponding source for this build is available via the FFmpeg project and the",
  "BtbN/FFmpeg-Builds lgpl-shared recipes referenced in NEUD-FFMPEG-PROVENANCE.txt.",
  "See docs/licensing/ffmpeg-lgpl.md in the NEUD source tree.",
  "You may replace these DLLs with a compatible LGPL shared build.",
  "",
].join("\n");
fs.writeFileSync(path.join(destDir, "SOURCE_OFFER.txt"), sourceOffer, "utf8");
fs.writeFileSync(path.join(windowsDir, "FFMPEG_SOURCE_OFFER.txt"), sourceOffer, "utf8");

console.log(
  `[ffmpeg] Staged ${copied} DLL(s) to ${destDir} and beside neud_video.node under ${windowsDir}`,
);
