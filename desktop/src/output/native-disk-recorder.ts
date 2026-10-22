import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import type {
  DiskRecordingCodecAvailability,
  DiskRecordingFormatId,
} from "./disk-recording-model";

export type NativeDiskRecorderAddon = {
  listCodecs(): DiskRecordingCodecAvailability[];
  open(options: {
    filePath: string;
    width: number;
    height: number;
    format: DiskRecordingFormatId;
    fpsNumerator: number;
    fpsDenominator: number;
    preserveAlpha: boolean;
    backgroundR: number;
    backgroundG: number;
    backgroundB: number;
  }): { ok: true; sessionId: string } | { ok: false; error: string };
  appendFrame(
    sessionId: string,
    frame: { width: number; height: number; ptsUs: number; bgra: Buffer },
  ): { ok: boolean; error?: string; encodedFrames: number; droppedFrames: number };
  finalize(
    sessionId: string,
  ): { ok: boolean; error?: string; encodedFrames: number; droppedFrames: number };
  close(sessionId: string): void;
  platform(): { encoder: string; available: boolean };
};

export type NativeDiskRecorderLoadFailure = {
  code:
    | "unsupported-platform"
    | "missing-file"
    | "wrong-arch"
    | "abi-mismatch"
    | "export-missing"
    | "native-load-failed"
    | "signing-failure"
    | "unknown";
  message: string;
  attemptedPaths: string[];
  detail: string | null;
};

export type NativeDiskRecorderLoadResult =
  | { ok: true; addon: NativeDiskRecorderAddon; path: string }
  | { ok: false; failure: NativeDiskRecorderLoadFailure };

let cached: NativeDiskRecorderAddon | null | undefined;
let cachedPath: string | null = null;
let lastFailure: NativeDiskRecorderLoadFailure | null = null;

/** Prefer platform-local sibling of dist/output (not ../../ — that escapes dist/). */
function withAsarUnpacked(candidate: string): string[] {
  if (candidate.includes(`${path.sep}app.asar${path.sep}`)) {
    return [candidate.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`), candidate];
  }
  if (candidate.includes("app.asar/")) {
    return [candidate.replace("app.asar/", "app.asar.unpacked/"), candidate];
  }
  return [candidate];
}

export function resolveNativeDiskRecorderCandidates(): string[] {
  const platformDir =
    process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
  const fileName = "neud_recorder.node";
  const base = [
    // Compiled loader lives at desktop/dist/output → sibling platform dir.
    path.join(__dirname, "..", "platform", platformDir, fileName),
    // Packaged resources / alternate layouts.
    path.join(__dirname, "..", "..", "platform", platformDir, fileName),
    path.join(__dirname, "..", "..", "dist", "platform", platformDir, fileName),
    // Dev tree next to desktop/dist.
    path.join(__dirname, "..", "..", "native", "recorder", "build", "Release", fileName),
    path.join(__dirname, "..", "..", "..", "desktop", "native", "recorder", "build", "Release", fileName),
  ];
  if (typeof process.resourcesPath === "string" && process.resourcesPath) {
    base.push(
      path.join(process.resourcesPath, "app.asar.unpacked", "dist", "platform", platformDir, fileName),
      path.join(process.resourcesPath, "dist", "platform", platformDir, fileName),
    );
  }
  const expanded: string[] = [];
  for (const candidate of base) {
    for (const variant of withAsarUnpacked(path.resolve(candidate))) {
      if (!expanded.includes(variant)) expanded.push(variant);
    }
  }
  return expanded;
}

function classifyLoadError(error: unknown, attemptedPaths: string[]): NativeDiskRecorderLoadFailure {
  const detail = error instanceof Error ? error.message : String(error ?? "unknown");
  const lower = detail.toLowerCase();
  let code: NativeDiskRecorderLoadFailure["code"] = "native-load-failed";
  let message = "Disk recorder could not be loaded on this installation.";

  if (process.platform !== "darwin" && process.platform !== "win32") {
    code = "unsupported-platform";
    message = "Disk recording is not supported on this platform.";
  } else if (/cannot find module|enoent|no such file/i.test(detail)) {
    const anyExists = attemptedPaths.some((candidate) => {
      try {
        return fs.existsSync(candidate);
      } catch {
        return false;
      }
    });
    code = anyExists ? "native-load-failed" : "missing-file";
    message = anyExists
      ? "Disk recorder module failed to load."
      : "Disk recorder addon is missing. Rebuild the desktop native recorder.";
  } else if (/wrong elf|incompatible architecture|mach-o|invalid elf|dlopen.*arch/i.test(lower)) {
    code = "wrong-arch";
    message = "Disk recorder addon architecture does not match this app.";
  } else if (/module_version|node_module_version|abi|was compiled against/i.test(lower)) {
    code = "abi-mismatch";
    message = "Disk recorder addon was built for a different Electron version.";
  } else if (/code sign|signature|killed|not valid for use/i.test(lower)) {
    code = "signing-failure";
    message = "Disk recorder addon failed a macOS security check.";
  }

  return { code, message, attemptedPaths, detail };
}

export function probeNativeDiskRecorderAddon(): NativeDiskRecorderLoadResult {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    const failure: NativeDiskRecorderLoadFailure = {
      code: "unsupported-platform",
      message: "Disk recording is not supported on this platform.",
      attemptedPaths: [],
      detail: `platform=${process.platform}`,
    };
    lastFailure = failure;
    return { ok: false, failure };
  }

  const require = createRequire(__filename);
  const attemptedPaths = resolveNativeDiskRecorderCandidates();
  const errors: string[] = [];

  for (const candidate of attemptedPaths) {
    if (!fs.existsSync(candidate)) {
      errors.push(`${candidate}: missing`);
      continue;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const addon = require(candidate) as NativeDiskRecorderAddon;
      if (!addon || typeof addon.open !== "function" || typeof addon.platform !== "function") {
        const failure: NativeDiskRecorderLoadFailure = {
          code: "export-missing",
          message: "Disk recorder addon is incomplete.",
          attemptedPaths,
          detail: `Missing required exports in ${candidate}`,
        };
        lastFailure = failure;
        console.error("[disk-recorder] addon export check failed", failure);
        return { ok: false, failure };
      }
      try {
        const platform = addon.platform();
        if (!platform?.available) {
          // Loaded, but encoder reports unavailable (e.g. Windows without redistributable).
          console.info("[disk-recorder] addon loaded; encoder reports unavailable", {
            path: candidate,
            platform,
          });
        }
      } catch (platformError) {
        errors.push(
          `${candidate}: platform() failed: ${
            platformError instanceof Error ? platformError.message : String(platformError)
          }`,
        );
        continue;
      }
      console.info("[disk-recorder] addon loaded", {
        path: candidate,
        electron: process.versions.electron ?? null,
        modules: process.versions.modules,
        arch: process.arch,
      });
      return { ok: true, addon, path: candidate };
    } catch (error) {
      errors.push(
        `${candidate}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const failure = classifyLoadError(
    errors[errors.length - 1] ?? "No recorder addon candidates found.",
    attemptedPaths,
  );
  failure.detail = errors.join(" | ") || failure.detail;
  lastFailure = failure;
  console.error("[disk-recorder] addon unavailable", {
    code: failure.code,
    message: failure.message,
    attemptedPaths,
    errors,
    electron: process.versions.electron ?? null,
    modules: process.versions.modules,
    arch: process.arch,
    platform: process.platform,
  });
  return { ok: false, failure };
}

export function loadNativeDiskRecorderAddon(): NativeDiskRecorderAddon | null {
  if (cached !== undefined) return cached;
  const result = probeNativeDiskRecorderAddon();
  if (result.ok) {
    cached = result.addon;
    cachedPath = result.path;
    return cached;
  }
  cached = null;
  cachedPath = null;
  return null;
}

/** Test helper: clear memoized load result. */
export function resetNativeDiskRecorderAddonCacheForTests(): void {
  cached = undefined;
  cachedPath = null;
  lastFailure = null;
}

export function getNativeDiskRecorderLoadFailure(): NativeDiskRecorderLoadFailure | null {
  if (cached === undefined) {
    loadNativeDiskRecorderAddon();
  }
  return cached ? null : lastFailure;
}

export function getNativeDiskRecorderLoadedPath(): string | null {
  if (cached === undefined) {
    loadNativeDiskRecorderAddon();
  }
  return cachedPath;
}

export function userFacingDiskRecorderUnavailableMessage(): string {
  const failure = getNativeDiskRecorderLoadFailure();
  if (!failure) return "Native disk recorder addon is not available on this installation.";
  return failure.message;
}

export function listDiskRecordingCodecAvailability(): DiskRecordingCodecAvailability[] {
  const addon = loadNativeDiskRecorderAddon();
  if (addon) {
    try {
      return addon.listCodecs();
    } catch {
      // fall through
    }
  }
  const reason = userFacingDiskRecorderUnavailableMessage();
  return [
    {
      format: "prores-4444-mov",
      label: "ProRes 4444",
      container: "mov",
      supportsAlpha: true,
      available: false,
      reason,
      encoder: "unavailable",
      licenseNote: "Rebuild the desktop recorder addon (npm run build -w @neud/desktop).",
    },
    {
      format: "prores-422hq-mov",
      label: "ProRes 422 HQ",
      container: "mov",
      supportsAlpha: false,
      available: false,
      reason,
      encoder: "unavailable",
      licenseNote: "Rebuild the desktop recorder addon (npm run build -w @neud/desktop).",
    },
    {
      format: "h264-mp4",
      label: "H.264",
      container: "mp4",
      supportsAlpha: false,
      available: false,
      reason,
      encoder: "unavailable",
      licenseNote: "Rebuild the desktop recorder addon (npm run build -w @neud/desktop).",
    },
  ];
}
