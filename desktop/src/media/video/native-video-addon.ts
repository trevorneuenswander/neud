import { createRequire } from "node:module";
import path from "node:path";

export type NativeVideoMediaInfo = {
  width: number;
  height: number;
  durationSeconds: number;
  frameRate: number;
  hasAlpha: boolean;
  codecLabel: string;
};

export type NativeVideoFrame = {
  width: number;
  height: number;
  stride: number;
  ptsUs: number;
  bgra: Buffer;
};

export type NativeVideoStatus = {
  state: string;
  loop: boolean;
  info: NativeVideoMediaInfo;
  hasFrame: boolean;
  ptsUs: number;
};

export type NativeVideoAddon = {
  open(filePath: string):
    | { ok: true; sessionId: string; info: NativeVideoMediaInfo }
    | { ok: false; error: string };
  play(sessionId: string): void;
  pause(sessionId: string): void;
  stop(sessionId: string): void;
  restart(sessionId: string): void;
  setLoop(sessionId: string, enabled: boolean): void;
  getStatus(sessionId: string): NativeVideoStatus;
  pullFrame(sessionId: string): NativeVideoFrame | null;
  onFrame(sessionId: string, cb: (frame: NativeVideoFrame) => void): void;
  onState(
    sessionId: string,
    cb: (payload: { state: string; error: string }) => void,
  ): void;
  close(sessionId: string): void;
  platform(): { decoder: string; available: boolean };
};

let cached: NativeVideoAddon | null | undefined;

function resolveAddonPath(): string[] {
  const candidates = [
    path.join(__dirname, "../../platform/macos/neud_video.node"),
    path.join(__dirname, "../../platform/windows/neud_video.node"),
    path.join(__dirname, "../../../dist/platform/macos/neud_video.node"),
    path.join(__dirname, "../../../dist/platform/windows/neud_video.node"),
    path.join(__dirname, "../../../native/video/build/Release/neud_video.node"),
  ];
  return candidates;
}

export function loadNativeVideoAddon(): NativeVideoAddon | null {
  if (cached !== undefined) return cached;
  const require = createRequire(__filename);
  for (const candidate of resolveAddonPath()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const addon = require(candidate) as NativeVideoAddon;
      if (addon && typeof addon.open === "function") {
        cached = addon;
        return cached;
      }
    } catch {
      // try next
    }
  }
  cached = null;
  return null;
}
