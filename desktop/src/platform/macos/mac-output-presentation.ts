import { createRequire } from "node:module";
import path from "node:path";

const nativeRequire = createRequire(__filename);

type NativeResult = { ok: boolean; error?: string; level?: number };

type MacOutputAddon = {
  configure(options: { nativeHandle: Buffer; coverSystemUi: boolean; hideCursor: boolean }): NativeResult;
  restore(nativeHandle: Buffer): NativeResult;
};

let addon: MacOutputAddon | null | undefined;

function loadMacOutputAddon(): MacOutputAddon | null {
  if (process.platform !== "darwin") return null;
  if (addon !== undefined) return addon;
  try {
    addon = nativeRequire(path.join(__dirname, "neud_mac_output.node")) as MacOutputAddon;
  } catch (error) {
    addon = null;
    console.error("[output-presentation] mac native helper unavailable", error);
  }
  return addon;
}

export function configureMacOutputWindow(options: {
  nativeHandle: Buffer;
  coverSystemUi: boolean;
  hideCursor: boolean;
}): void {
  if (process.platform !== "darwin") return;
  const native = loadMacOutputAddon();
  if (!native) return;
  const result = native.configure(options);
  if (!result.ok) {
    console.error("[output-presentation] configureMacOutputWindow failed", result.error);
  }
}

export function restoreMacOutputWindow(nativeHandle: Buffer): void {
  if (process.platform !== "darwin") return;
  const native = loadMacOutputAddon();
  if (!native) return;
  const result = native.restore(nativeHandle);
  if (!result.ok) {
    console.error("[output-presentation] restoreMacOutputWindow failed", result.error);
  }
}
