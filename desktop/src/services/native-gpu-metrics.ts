import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export type GpuAdapterMetrics = {
  name: string;
  utilizationPercent: number;
  memoryAvailable: boolean;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
};

export type NativeGpuSample = {
  available: boolean;
  utilizationPercent: number | null;
  reason: string | null;
  source: string;
  aggregation: string;
  adapters: GpuAdapterMetrics[];
};

export type NativeSystemMemorySample = {
  available: boolean;
  totalBytes: number | null;
  usedBytes: number | null;
  availableBytes: number | null;
  utilizationPercent: number | null;
  reason: string | null;
  source: string;
  definition: string;
  pressureAvailable: boolean;
  pressureLevel: string | null;
};

type NativeGpuAddon = {
  sample: () => {
    available: boolean;
    utilizationPercent: number | null;
    reason: string | null;
    source: string;
    aggregation: string;
    adapters: Array<{
      name: string;
      utilizationPercent: number;
      memoryAvailable: boolean;
      memoryUsedBytes: number | null;
      memoryTotalBytes: number | null;
    }>;
  };
  sampleMemory?: () => {
    available: boolean;
    totalBytes: number | null;
    usedBytes: number | null;
    availableBytes: number | null;
    utilizationPercent: number | null;
    reason: string | null;
    source: string;
    definition: string;
    pressureAvailable: boolean;
    pressureLevel: string | null;
  };
  shutdown: () => void;
};

/** createRequire anchor that works under CJS (Electron) and ESM strip-types tests. */
function requireAnchor(): string {
  try {
    const cjs = (0, eval)("__filename") as unknown;
    if (typeof cjs === "string" && cjs.length > 0) return cjs;
  } catch {
    // ESM / strip-types
  }
  return path.join(process.cwd(), "package.json");
}

const nativeRequire = createRequire(requireAnchor());

function moduleDirCandidates(): string[] {
  const dirs: string[] = [];
  try {
    const cjs = (0, eval)("__dirname") as unknown;
    if (typeof cjs === "string" && cjs.length > 0) dirs.push(cjs);
  } catch {
    // ignore
  }
  // When loaded from src/services or dist/services during tests / runtime.
  dirs.push(path.join(process.cwd(), "src", "services"));
  dirs.push(path.join(process.cwd(), "dist", "services"));
  dirs.push(path.join(process.cwd(), "desktop", "src", "services"));
  dirs.push(path.join(process.cwd(), "desktop", "dist", "services"));
  return dirs;
}

let addon: NativeGpuAddon | null | undefined;
let loadError: string | null = null;
let sampling = false;
let sampleTimer: ReturnType<typeof setInterval> | null = null;
let cached: NativeGpuSample | null = null;
let cachedMemory: NativeSystemMemorySample | null = null;
let shutDown = false;

const SAMPLE_INTERVAL_MS = 1500;

function withAsarUnpacked(candidate: string): string[] {
  if (candidate.includes(`${path.sep}app.asar${path.sep}`)) {
    return [
      candidate.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`),
      candidate,
    ];
  }
  if (candidate.includes("app.asar/")) {
    return [candidate.replace("app.asar/", "app.asar.unpacked/"), candidate];
  }
  return [candidate];
}

export function resolveNativeGpuCandidates(): string[] {
  const platformDir =
    process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
  const fileName = "neud_gpu.node";
  const base: string[] = [];
  for (const dir of moduleDirCandidates()) {
    base.push(
      path.join(dir, "..", "platform", platformDir, fileName),
      path.join(dir, "..", "..", "platform", platformDir, fileName),
      path.join(dir, "..", "..", "dist", "platform", platformDir, fileName),
      path.join(dir, "..", "..", "native", "gpu", "build", "Release", fileName),
    );
  }
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

function unavailable(reason: string, source = "none"): NativeGpuSample {
  return {
    available: false,
    utilizationPercent: null,
    reason,
    source,
    aggregation: "",
    adapters: [],
  };
}

function loadAddon(): NativeGpuAddon | null {
  if (addon !== undefined) return addon;
  if (process.platform !== "darwin" && process.platform !== "win32") {
    loadError = "GPU utilization collection is not supported on this platform.";
    addon = null;
    return null;
  }
  const candidates = resolveNativeGpuCandidates();
  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const loaded = nativeRequire(candidate) as NativeGpuAddon;
      if (typeof loaded?.sample !== "function" || typeof loaded?.shutdown !== "function") {
        errors.push(`${candidate}: missing sample/shutdown exports`);
        continue;
      }
      // sampleMemory is optional for older addon builds; JS falls back when absent.
      addon = loaded;
      loadError = null;
      return addon;
    } catch (error) {
      errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  loadError =
    errors.length > 0
      ? `Native GPU addon failed to load (${errors[0]}).`
      : "Native GPU addon (neud_gpu.node) is missing from this build.";
  addon = null;
  return null;
}

function normalizeSample(raw: ReturnType<NativeGpuAddon["sample"]>): NativeGpuSample {
  if (!raw || typeof raw !== "object") {
    return unavailable("GPU sample returned an invalid payload.");
  }
  if (!raw.available) {
    return unavailable(
      typeof raw.reason === "string" && raw.reason
        ? raw.reason
        : "GPU utilization unavailable.",
      typeof raw.source === "string" ? raw.source : "native",
    );
  }
  const pct = raw.utilizationPercent;
  if (typeof pct !== "number" || !Number.isFinite(pct)) {
    return unavailable("GPU sample missing utilizationPercent.", raw.source || "native");
  }
  const clamped = Math.max(0, Math.min(100, pct));
  const adapters: GpuAdapterMetrics[] = [];
  if (Array.isArray(raw.adapters)) {
    for (const entry of raw.adapters) {
      if (!entry || typeof entry !== "object") continue;
      const util =
        typeof entry.utilizationPercent === "number" && Number.isFinite(entry.utilizationPercent)
          ? Math.max(0, Math.min(100, entry.utilizationPercent))
          : 0;
      adapters.push({
        name: typeof entry.name === "string" && entry.name ? entry.name : "GPU",
        utilizationPercent: util,
        memoryAvailable: Boolean(entry.memoryAvailable),
        memoryUsedBytes:
          entry.memoryAvailable && typeof entry.memoryUsedBytes === "number"
            ? entry.memoryUsedBytes
            : null,
        memoryTotalBytes:
          entry.memoryAvailable && typeof entry.memoryTotalBytes === "number"
            ? entry.memoryTotalBytes
            : null,
      });
    }
  }
  return {
    available: true,
    utilizationPercent: Math.round(clamped * 10) / 10,
    reason: null,
    source: typeof raw.source === "string" ? raw.source : "native",
    aggregation: typeof raw.aggregation === "string" ? raw.aggregation : "",
    adapters,
  };
}

function memoryUnavailable(reason: string, source = "none"): NativeSystemMemorySample {
  return {
    available: false,
    totalBytes: null,
    usedBytes: null,
    availableBytes: null,
    utilizationPercent: null,
    reason,
    source,
    definition: "",
    pressureAvailable: false,
    pressureLevel: null,
  };
}

function normalizeMemorySample(
  raw: NonNullable<ReturnType<NonNullable<NativeGpuAddon["sampleMemory"]>>>,
): NativeSystemMemorySample {
  if (!raw || typeof raw !== "object" || !raw.available) {
    return memoryUnavailable(
      typeof raw?.reason === "string" && raw.reason ? raw.reason : "System memory unavailable.",
      typeof raw?.source === "string" ? raw.source : "native",
    );
  }
  const total = raw.totalBytes;
  const used = raw.usedBytes;
  const pct = raw.utilizationPercent;
  if (
    typeof total !== "number" ||
    !Number.isFinite(total) ||
    total <= 0 ||
    typeof used !== "number" ||
    !Number.isFinite(used) ||
    typeof pct !== "number" ||
    !Number.isFinite(pct)
  ) {
    return memoryUnavailable("System memory sample missing numeric fields.", raw.source || "native");
  }
  return {
    available: true,
    totalBytes: total,
    usedBytes: Math.max(0, Math.min(total, used)),
    availableBytes:
      typeof raw.availableBytes === "number" && Number.isFinite(raw.availableBytes)
        ? raw.availableBytes
        : Math.max(0, total - used),
    utilizationPercent: Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10,
    reason: null,
    source: typeof raw.source === "string" ? raw.source : "native",
    definition: typeof raw.definition === "string" ? raw.definition : "",
    pressureAvailable: Boolean(raw.pressureAvailable),
    pressureLevel:
      raw.pressureAvailable && typeof raw.pressureLevel === "string" ? raw.pressureLevel : null,
  };
}

function sampleOnce(): NativeGpuSample {
  if (shutDown) {
    return unavailable("GPU sampling stopped during application shutdown.");
  }
  const native = loadAddon();
  if (!native) {
    return unavailable(loadError ?? "Native GPU addon is unavailable.");
  }
  try {
    return normalizeSample(native.sample());
  } catch (error) {
    return unavailable(
      `GPU sample failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function sampleMemoryOnce(): NativeSystemMemorySample {
  if (shutDown) {
    return memoryUnavailable("Memory sampling stopped during application shutdown.");
  }
  const native = loadAddon();
  if (!native) {
    return memoryUnavailable(loadError ?? "Native GPU addon is unavailable.");
  }
  if (typeof native.sampleMemory !== "function") {
    return memoryUnavailable(
      "Native memory sampler is not present in this neud_gpu build.",
      "legacy-addon",
    );
  }
  try {
    return normalizeMemorySample(native.sampleMemory());
  } catch (error) {
    return memoryUnavailable(
      `Memory sample failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function sampleTick(): void {
  cached = sampleOnce();
  cachedMemory = sampleMemoryOnce();
}

/** Start background sampling (~1.5s). Safe to call repeatedly. */
export function ensureGpuSampling(): void {
  if (shutDown || sampling) return;
  sampling = true;
  sampleTick();
  sampleTimer = setInterval(() => {
    if (shutDown) return;
    sampleTick();
  }, SAMPLE_INTERVAL_MS);
  // Avoid keeping the event loop alive solely for metrics when no other work remains.
  if (sampleTimer && typeof sampleTimer.unref === "function") {
    sampleTimer.unref();
  }
}

/** Latest cached sample; starts sampling on first call. */
export function getCachedGpuSample(): NativeGpuSample {
  if (shutDown) {
    return unavailable("GPU sampling stopped during application shutdown.");
  }
  ensureGpuSampling();
  return cached ?? sampleOnce();
}

/** Latest cached system memory sample; starts sampling on first call. */
export function getCachedSystemMemorySample(): NativeSystemMemorySample {
  if (shutDown) {
    return memoryUnavailable("Memory sampling stopped during application shutdown.");
  }
  ensureGpuSampling();
  return cachedMemory ?? sampleMemoryOnce();
}

/** Immediate sample (for tests). Does not invent values. */
export function sampleGpuMetricsNow(): NativeGpuSample {
  return sampleOnce();
}

/** Stop timer and release native handles. Idempotent. */
export function disposeGpuMetrics(): void {
  shutDown = true;
  sampling = false;
  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
  cached = null;
  cachedMemory = null;
  try {
    addon?.shutdown();
  } catch {
    // ignore
  }
}

/** Test helper: reset shutdown flag (not for production shutdown paths). */
export function resetGpuMetricsForTests(): void {
  disposeGpuMetrics();
  shutDown = false;
  addon = undefined;
  loadError = null;
}
