import os from "node:os";
import {
  disposeGpuMetrics,
  getCachedGpuSample,
  getCachedSystemMemorySample,
  type NativeGpuSample,
  type NativeSystemMemorySample,
} from "./native-gpu-metrics.ts";

export type GpuAdapterView = {
  name: string;
  utilizationPercent: number;
  memoryAvailable: boolean;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
};

export type GpuMetrics =
  | {
      available: true;
      /** Total system GPU utilization (%). Not NEUD-only. */
      utilizationPercent: number;
      model: string | null;
      memoryAvailable: boolean;
      memoryUsedBytes: number | null;
      memoryTotalBytes: number | null;
      source: string;
      aggregation: string;
      adapters: GpuAdapterView[];
      reason?: undefined;
    }
  | {
      available: false;
      reason: string;
      utilizationPercent?: undefined;
      model?: undefined;
      memoryAvailable?: false;
      memoryUsedBytes?: null;
      memoryTotalBytes?: null;
      source?: string;
      aggregation?: string;
      adapters?: GpuAdapterView[];
    };

export type PerformanceMetricsSnapshot = {
  collectedAt: string;
  cpu: {
    neudPercent: number;
    systemPercent: number | null;
  };
  memory: {
    neudBytes: number;
    systemUsedBytes: number;
    systemTotalBytes: number;
    /** System RAM utilization % (platform-specific accounting). */
    systemPercent: number | null;
    /** How systemUsedBytes / systemPercent were derived. */
    accounting: string;
    source: string;
    /** macOS memory pressure when available. */
    pressureLevel: string | null;
  };
  gpu: GpuMetrics;
};

type CpuTimesSample = {
  idle: number;
  total: number;
};

let lastProcessCpu = process.cpuUsage();
let lastHrtimeNs = process.hrtime.bigint();
let lastSystemSample: CpuTimesSample | null = null;

function sampleSystemCpu(): CpuTimesSample {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

function computeSystemCpuPercent(previous: CpuTimesSample | null, next: CpuTimesSample): number | null {
  if (!previous) return null;
  const idleDelta = next.idle - previous.idle;
  const totalDelta = next.total - previous.total;
  if (totalDelta <= 0) return null;
  const used = 1 - idleDelta / totalDelta;
  return Math.max(0, Math.min(100, used * 100));
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function toGpuMetrics(sample: NativeGpuSample): GpuMetrics {
  if (!sample.available || sample.utilizationPercent == null) {
    return {
      available: false,
      reason: sample.reason ?? "GPU utilization unavailable.",
      source: sample.source,
      aggregation: sample.aggregation,
      adapters: sample.adapters,
    };
  }
  const adapters = sample.adapters;
  const primary = adapters[0] ?? null;
  const memoryAdapter =
    adapters.find((a) => a.memoryAvailable && a.memoryTotalBytes != null) ?? primary;
  return {
    available: true,
    utilizationPercent: sample.utilizationPercent,
    model: primary?.name ?? (adapters.length === 1 ? adapters[0].name : null),
    memoryAvailable: Boolean(memoryAdapter?.memoryAvailable),
    memoryUsedBytes: memoryAdapter?.memoryUsedBytes ?? null,
    memoryTotalBytes: memoryAdapter?.memoryTotalBytes ?? null,
    source: sample.source,
    aggregation: sample.aggregation,
    adapters,
  };
}

/**
 * Fallback when native memory sampler is unavailable.
 * On macOS, os.freemem() is only truly free pages — total−free inflates "used"
 * by counting file cache. Prefer native host_vm_info64 accounting.
 */
function fallbackNodeMemory(): {
  systemUsedBytes: number;
  systemTotalBytes: number;
  systemPercent: number;
  accounting: string;
  source: string;
  pressureLevel: null;
} {
  const systemTotalBytes = os.totalmem();
  const systemUsedBytes = Math.max(0, systemTotalBytes - os.freemem());
  return {
    systemUsedBytes,
    systemTotalBytes,
    systemPercent: roundPercent((systemUsedBytes / systemTotalBytes) * 100),
    accounting:
      "fallback: total − os.freemem() (on macOS this overstates used by treating reclaimable file cache as consumed)",
    source: "node-os",
    pressureLevel: null,
  };
}

function toSystemMemory(sample: NativeSystemMemorySample): {
  systemUsedBytes: number;
  systemTotalBytes: number;
  systemPercent: number | null;
  accounting: string;
  source: string;
  pressureLevel: string | null;
} {
  if (
    !sample.available ||
    sample.usedBytes == null ||
    sample.totalBytes == null ||
    sample.totalBytes <= 0 ||
    sample.utilizationPercent == null
  ) {
    return fallbackNodeMemory();
  }
  return {
    systemUsedBytes: sample.usedBytes,
    systemTotalBytes: sample.totalBytes,
    systemPercent: roundPercent(sample.utilizationPercent),
    accounting: sample.definition || "native system memory sample",
    source: sample.source,
    pressureLevel: sample.pressureAvailable ? sample.pressureLevel : null,
  };
}

/** Collect process + host CPU/RAM/GPU metrics. GPU/RAM are never invented. */
export function collectPerformanceMetrics(): PerformanceMetricsSnapshot {
  const elapsedCpu = process.cpuUsage(lastProcessCpu);
  const nowHr = process.hrtime.bigint();
  const elapsedUs = Number(nowHr - lastHrtimeNs) / 1000;
  lastProcessCpu = process.cpuUsage();
  lastHrtimeNs = nowHr;

  const neudCpuPercent =
    elapsedUs > 0
      ? roundPercent(Math.min(100, ((elapsedCpu.user + elapsedCpu.system) / elapsedUs) * 100))
      : 0;

  const systemSample = sampleSystemCpu();
  const systemPercentRaw = computeSystemCpuPercent(lastSystemSample, systemSample);
  lastSystemSample = systemSample;

  const memory = process.memoryUsage();
  const systemMemory = toSystemMemory(getCachedSystemMemorySample());

  return {
    collectedAt: new Date().toISOString(),
    cpu: {
      neudPercent: neudCpuPercent,
      systemPercent: systemPercentRaw == null ? null : roundPercent(systemPercentRaw),
    },
    memory: {
      neudBytes: memory.rss,
      systemUsedBytes: systemMemory.systemUsedBytes,
      systemTotalBytes: systemMemory.systemTotalBytes,
      systemPercent: systemMemory.systemPercent,
      accounting: systemMemory.accounting,
      source: systemMemory.source,
      pressureLevel: systemMemory.pressureLevel,
    },
    gpu: toGpuMetrics(getCachedGpuSample()),
  };
}

/** Release GPU collector resources during app shutdown. */
export function disposePerformanceGpuMetrics(): void {
  disposeGpuMetrics();
}

export function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}${units[unitIndex]}`;
}
