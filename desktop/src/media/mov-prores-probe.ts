/**
 * Lightweight QuickTime / .mov probe for Apple ProRes 4444 validation.
 * Reads atom headers only — does not load the entire media file into memory.
 */

import fs from "fs";
import { open as fsOpen } from "fs/promises";

export type MovProResProbeResult =
  | {
      ok: true;
      container: "mov";
      codecFourCc: string;
      profileLabel: string;
      width: number;
      height: number;
      hasAlphaHint: boolean;
      durationSeconds: number | null;
      fileSizeBytes: number;
    }
  | {
      ok: false;
      error: string;
    };

const PRORES_4444 = new Set(["ap4h", "ap4x"]);

function readUInt32BE(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset);
}

function readFourCc(buf: Buffer, offset: number): string {
  return buf.subarray(offset, offset + 4).toString("ascii");
}

/**
 * Walk top-level and nested atoms looking for ProRes sample description + tkhd size.
 */
export async function probeMovProRes4444(filePath: string): Promise<MovProResProbeResult> {
  let handle: fs.promises.FileHandle | null = null;
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      return { ok: false, error: "Selected path is not a file." };
    }
    if (stat.size < 32) {
      return { ok: false, error: "File is too small to be a valid QuickTime movie." };
    }

    handle = await fsOpen(filePath, "r");
    const found = {
      codecFourCc: "",
      width: 0,
      height: 0,
      durationSeconds: null as number | null,
      timescale: 0,
      durationUnits: 0,
      ftyp: "",
    };

    async function readExact(position: number, length: number): Promise<Buffer> {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await handle!.read(buf, 0, length, position);
      if (bytesRead < length) {
        throw new Error("Unexpected end of file while reading media atoms.");
      }
      return buf;
    }

    async function walk(start: number, end: number, depth: number): Promise<void> {
      if (depth > 24) return;
      let offset = start;
      while (offset + 8 <= end) {
        const header = await readExact(offset, 8);
        let size = readUInt32BE(header, 0);
        const type = readFourCc(header, 4);
        let headerSize = 8;
        if (size === 1) {
          const large = await readExact(offset + 8, 8);
          size = Number(large.readBigUInt64BE(0));
          headerSize = 16;
        } else if (size === 0) {
          size = end - offset;
        }
        if (size < headerSize || offset + size > end) {
          break;
        }
        const contentStart = offset + headerSize;
        const contentEnd = offset + size;

        if (type === "ftyp" && contentEnd - contentStart >= 4) {
          found.ftyp = readFourCc(await readExact(contentStart, 4), 0);
        }

        if (type === "mvhd" && contentEnd - contentStart >= 20) {
          const mvhd = await readExact(contentStart, Math.min(32, contentEnd - contentStart));
          const version = mvhd[0] ?? 0;
          if (version === 0 && mvhd.length >= 20) {
            found.timescale = readUInt32BE(mvhd, 12);
            found.durationUnits = readUInt32BE(mvhd, 16);
          }
        }

        if (type === "tkhd" && contentEnd - contentStart >= 84) {
          const tkhd = await readExact(contentStart, Math.min(92, contentEnd - contentStart));
          const version = tkhd[0] ?? 0;
          // width/height are 16.16 fixed at end of tkhd
          const base = version === 1 ? 96 : 84;
          if (tkhd.length >= base + 8) {
            const w = readUInt32BE(tkhd, base) / 65536;
            const h = readUInt32BE(tkhd, base + 4) / 65536;
            if (w > found.width) found.width = Math.round(w);
            if (h > found.height) found.height = Math.round(h);
          }
        }

        if (type === "stsd" && contentEnd - contentStart >= 16) {
          const stsd = await readExact(contentStart, Math.min(96, contentEnd - contentStart));
          // stsd: version/flags(4) + entry_count(4) + sample entry
          if (stsd.length >= 16) {
            const fourCc = readFourCc(stsd, 12);
            if (PRORES_4444.has(fourCc) || fourCc.startsWith("ap")) {
              found.codecFourCc = fourCc;
            }
            // VisualSampleEntry width/height at +32/+34 from sample entry start (byte 8 of entry)
            if (stsd.length >= 44) {
              const entryW = stsd.readUInt16BE(32);
              const entryH = stsd.readUInt16BE(34);
              if (entryW > 0) found.width = entryW;
              if (entryH > 0) found.height = entryH;
            }
          }
        }

        if (
          type === "moov" ||
          type === "trak" ||
          type === "mdia" ||
          type === "minf" ||
          type === "stbl"
        ) {
          await walk(contentStart, contentEnd, depth + 1);
        }

        offset += size;
      }
    }

    await walk(0, stat.size, 0);

    if (found.timescale > 0 && found.durationUnits > 0) {
      found.durationSeconds = found.durationUnits / found.timescale;
    }

    if (!found.codecFourCc) {
      return {
        ok: false,
        error:
          "This file does not appear to contain an Apple ProRes video track. NEUD currently accepts ProRes 4444 (.mov) only.",
      };
    }
    if (!PRORES_4444.has(found.codecFourCc)) {
      return {
        ok: false,
        error: `Unsupported ProRes profile "${found.codecFourCc}". Required: ProRes 4444 (ap4h / ap4x).`,
      };
    }
    if (found.width <= 0 || found.height <= 0) {
      return {
        ok: false,
        error: "Could not read the video frame size from the media file.",
      };
    }

    return {
      ok: true,
      container: "mov",
      codecFourCc: found.codecFourCc,
      profileLabel: found.codecFourCc === "ap4x" ? "Apple ProRes 4444 XQ" : "Apple ProRes 4444",
      width: found.width,
      height: found.height,
      // ProRes 4444 profiles carry alpha; we require the profile rather than trusting a soft flag.
      hasAlphaHint: true,
      durationSeconds: found.durationSeconds,
      fileSizeBytes: stat.size,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to inspect the media file.",
    };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export function assertMovFileExtension(fileName: string): string | null {
  if (!/\.mov$/i.test(fileName)) {
    return "Choose a .mov file containing Apple ProRes 4444 with alpha.";
  }
  return null;
}

/** Test helper: ensure path exists and is readable. */
export function mediaFileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
