"use client";

import { useEffect, useState } from "react";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";

export type GpuAdapterView = {
  name: string;
  utilizationPercent: number;
  memoryAvailable: boolean;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
};

export type PerformanceMetricsView = {
  collectedAt: string;
  cpu: { neudPercent: number; systemPercent: number | null };
  memory: {
    neudBytes: number;
    systemUsedBytes: number;
    systemTotalBytes: number;
    systemPercent: number | null;
    accounting: string;
    source: string;
    pressureLevel: string | null;
  };
  gpu:
    | {
        available: true;
        utilizationPercent: number;
        model: string | null;
        memoryAvailable: boolean;
        memoryUsedBytes: number | null;
        memoryTotalBytes: number | null;
        source: string;
        aggregation: string;
        adapters: GpuAdapterView[];
      }
    | {
        available: false;
        reason: string;
        source?: string;
        aggregation?: string;
        adapters?: GpuAdapterView[];
      };
};

type RecordingDiagnosticsView = {
  routeId: string;
  name: string;
  status: string;
  actualFps: number | null;
  droppedFrames: number | null;
  writeBytesPerSecond: number | null;
  encoderStatus: string | null;
  availableDiskBytes: number | null;
};

const PERF_BAR_HEIGHT_PX = 28;

/** Always one decimal place with a space before the unit (e.g. "10.0 GB", "265.0 MB"). */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  if (unitIndex === 0) {
    return `${Math.round(value)} ${units[unitIndex]}`;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${Math.round(value)}%`;
}

function formatThroughput(bytesPerSecond: number | null): string {
  if (bytesPerSecond == null || !Number.isFinite(bytesPerSecond)) return "Unavailable";
  return `${formatBytes(bytesPerSecond)}/s`;
}

function isAppleSiliconGpuModel(model: string | null | undefined): boolean {
  if (!model) return false;
  return /^Apple\s+M\d/i.test(model.trim()) || /^Apple\s+GPU/i.test(model.trim());
}

function formatPressure(level: string | null | undefined): string {
  if (!level) return "Unavailable";
  const normalized = level.trim().toLowerCase();
  if (normalized === "normal" || normalized === "warning" || normalized === "critical") {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  return "Unavailable";
}

export function PerformanceStatusBar() {
  const [desktop, setDesktop] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetricsView | null>(null);
  const [recordingDiagnostics, setRecordingDiagnostics] = useState<RecordingDiagnosticsView[]>(
    [],
  );

  useEffect(() => {
    setDesktop(isDesktopEnvironment());
  }, []);

  useEffect(() => {
    if (!desktop) return;
    document.documentElement.style.setProperty(
      "--neud-perf-bar-height",
      `${PERF_BAR_HEIGHT_PX}px`,
    );
    return () => {
      document.documentElement.style.removeProperty("--neud-perf-bar-height");
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    const api = getDesktopAPI()?.system;
    if (!api?.performanceMetrics) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await api.performanceMetrics();
        if (!cancelled && next) {
          setMetrics(next as PerformanceMetricsView);
        }
      } catch {
        if (!cancelled) setMetrics(null);
      }
    };

    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop || !expanded) {
      setRecordingDiagnostics([]);
      return;
    }
    const output = getDesktopAPI()?.output;
    if (!output?.listRoutes) return;

    let cancelled = false;
    const refreshDiagnostics = async () => {
      try {
        const routes = (await output.listRoutes()) as Array<{
          id: string;
          name: string;
          adapterType?: string;
          session?: { status?: string };
          recording?: {
            lifecycle?: string;
            actualFps?: number | null;
            droppedFrames?: number | null;
            writeBytesPerSecond?: number | null;
            availableDiskBytes?: number | null;
            format?: string | null;
          } | null;
          decklink?: {
            droppedFrames?: number;
            framesDelivered?: number;
          } | null;
        }>;
        if (cancelled) return;
        const next: RecordingDiagnosticsView[] = [];
        for (const route of routes) {
          const status = route.session?.status ?? "stopped";
          const active =
            status === "live" ||
            status === "starting" ||
            status === "recording" ||
            status === "finalizing";
          if (!active) continue;
          if (route.adapterType === "disk") {
            next.push({
              routeId: route.id,
              name: route.name,
              status,
              actualFps: route.recording?.actualFps ?? null,
              droppedFrames: route.recording?.droppedFrames ?? null,
              writeBytesPerSecond: route.recording?.writeBytesPerSecond ?? null,
              encoderStatus: route.recording?.format
                ? `${route.recording.format} · ${route.recording.lifecycle ?? status}`
                : (route.recording?.lifecycle ?? status),
              availableDiskBytes: route.recording?.availableDiskBytes ?? null,
            });
          } else if (route.adapterType === "decklink") {
            next.push({
              routeId: route.id,
              name: route.name,
              status,
              actualFps: null,
              droppedFrames: route.decklink?.droppedFrames ?? null,
              writeBytesPerSecond: null,
              encoderStatus: "DeckLink output",
              availableDiskBytes: null,
            });
          } else {
            next.push({
              routeId: route.id,
              name: route.name,
              status,
              actualFps: null,
              droppedFrames: null,
              writeBytesPerSecond: null,
              encoderStatus: "Computer display",
              availableDiskBytes: null,
            });
          }
        }
        setRecordingDiagnostics(next);
      } catch {
        if (!cancelled) setRecordingDiagnostics([]);
      }
    };

    void refreshDiagnostics();
    const intervalId = window.setInterval(() => {
      void refreshDiagnostics();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [desktop, expanded]);

  if (!desktop) {
    return null;
  }

  const cpuSystem = formatPercent(metrics?.cpu.systemPercent ?? null);
  const gpu = metrics?.gpu ?? null;
  const gpuAvailable = gpu?.available === true;
  const gpuOk = gpuAvailable ? gpu : null;
  const gpuPercent = gpuOk ? formatPercent(gpuOk.utilizationPercent) : null;
  const gpuCompact = gpuPercent ?? "—";
  const gpuReason =
    gpu?.available === false
      ? gpu.reason
      : gpuOk
        ? "Total system GPU utilization"
        : "GPU metrics pending…";
  const ramUsed = formatBytes(metrics?.memory.systemUsedBytes ?? 0);
  const ramPercent = formatPercent(metrics?.memory.systemPercent ?? null);
  const ramCompact =
    metrics?.memory.systemPercent != null ? `${ramPercent} (${ramUsed})` : ramUsed;
  const appleSiliconGpu = isAppleSiliconGpuModel(gpuOk?.model ?? null);
  const gpuMemoryLabel = appleSiliconGpu ? "GPU allocation" : "GPU memory";
  const pressureLabel = formatPressure(metrics?.memory.pressureLevel ?? null);

  return (
    <div
      data-performance-status-bar=""
      data-expanded={expanded ? "true" : "false"}
      className="fixed inset-x-0 bottom-0 z-[1000] border-t border-border bg-surface text-[11px] text-muted"
      style={{ height: "var(--neud-perf-bar-height, 28px)" }}
    >
      <button
        type="button"
        className="flex h-full w-full items-center justify-end gap-2 overflow-hidden px-3 text-right hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        aria-expanded={expanded}
        aria-label="Performance status"
        onClick={() => setExpanded((value) => !value)}
      >
        <span
          data-perf-summary=""
          className="flex min-w-0 max-w-full items-center justify-end gap-4 overflow-hidden whitespace-nowrap sm:gap-5"
          title={`CPU ${cpuSystem} | GPU ${gpuAvailable ? gpuCompact : gpuReason} | RAM ${ramCompact}`}
        >
          <span data-perf-compact="cpu" className="shrink-0">
            CPU {cpuSystem}
          </span>
          <span data-perf-compact="gpu" className="shrink-0" title={gpuReason}>
            GPU {gpuCompact}
          </span>
          <span data-perf-compact="memory" className="min-w-0 truncate">
            RAM {ramCompact}
          </span>
        </span>
        <span className="shrink-0 text-muted">{expanded ? "▾" : "▴"}</span>
      </button>
      {expanded ? (
        <div
          data-perf-detail=""
          className="absolute bottom-full left-0 right-0 max-h-[50vh] overflow-y-auto border-t border-border bg-surface-raised px-3 py-2 text-[11px] text-muted shadow-lg"
        >
          <div className="grid gap-1 sm:grid-cols-3">
            <div data-perf-metric="cpu">
              <div className="font-medium text-foreground/80">CPU</div>
              <div>NEUD {formatPercent(metrics?.cpu.neudPercent)}</div>
              <div>System {cpuSystem}</div>
            </div>
            <div data-perf-metric="gpu" title={gpuReason}>
              <div className="font-medium text-foreground/80">GPU</div>
              {gpuOk ? (
                <>
                  <div>System {formatPercent(gpuOk.utilizationPercent)}</div>
                  <div>{gpuOk.model ?? "Adapter unknown"}</div>
                  {gpuOk.memoryAvailable &&
                  gpuOk.memoryUsedBytes != null &&
                  gpuOk.memoryTotalBytes != null ? (
                    <div data-gpu-memory-label={gpuMemoryLabel}>
                      {gpuMemoryLabel} {formatBytes(gpuOk.memoryUsedBytes)} /{" "}
                      {formatBytes(gpuOk.memoryTotalBytes)}
                    </div>
                  ) : (
                    <div>{gpuMemoryLabel} Unavailable</div>
                  )}
                  {gpuOk.adapters.length > 1 ? (
                    <ul className="mt-1 space-y-0.5">
                      {gpuOk.adapters.map((adapter) => (
                        <li key={`${adapter.name}-${adapter.utilizationPercent}`}>
                          {adapter.name}: {formatPercent(adapter.utilizationPercent)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <div>{gpuReason}</div>
              )}
            </div>
            <div data-perf-metric="memory">
              <div className="font-medium text-foreground/80">Memory</div>
              <div>System {ramPercent}</div>
              <div>
                {ramUsed} / {formatBytes(metrics?.memory.systemTotalBytes ?? 0)}
              </div>
              <div>NEUD {formatBytes(metrics?.memory.neudBytes ?? 0)}</div>
              <div data-memory-pressure="">Pressure {pressureLabel}</div>
            </div>
          </div>

          <div className="mt-3 border-t border-border pt-2" data-perf-output-diagnostics="">
            <div className="mb-1 font-medium text-foreground/80">
              Output / Recording Diagnostics
            </div>
            {recordingDiagnostics.length === 0 ? (
              <p>No active outputs.</p>
            ) : (
              <ul className="grid gap-2">
                {recordingDiagnostics.map((entry) => (
                  <li key={entry.routeId} className="grid gap-0.5 sm:grid-cols-2">
                    <div className="font-medium text-foreground/80">
                      {entry.name} · {entry.status}
                    </div>
                    <div>
                      Actual Output FPS:{" "}
                      {entry.actualFps != null ? entry.actualFps : "Unavailable"}
                    </div>
                    <div>
                      Dropped frames:{" "}
                      {entry.droppedFrames != null ? entry.droppedFrames : "Unavailable"}
                    </div>
                    <div>Disk write: {formatThroughput(entry.writeBytesPerSecond)}</div>
                    <div>Encoder: {entry.encoderStatus ?? "Unavailable"}</div>
                    <div>
                      Disk space:{" "}
                      {entry.availableDiskBytes != null
                        ? formatBytes(entry.availableDiskBytes)
                        : "Unavailable"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 border-t border-border pt-2" data-perf-technical-details="">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left font-medium text-foreground/80 hover:text-foreground"
              aria-expanded={techOpen}
              onClick={(event) => {
                event.stopPropagation();
                setTechOpen((value) => !value);
              }}
            >
              <span>Technical Details</span>
              <span className="text-muted">{techOpen ? "▾" : "▸"}</span>
            </button>
            {techOpen ? (
              <div className="mt-1 space-y-1 text-[10px] leading-snug text-muted">
                <div>
                  GPU source: {gpuOk?.source ?? (gpu?.available === false ? gpu.source : null) ?? "n/a"}
                </div>
                <div>
                  GPU aggregation: {gpuOk?.aggregation ?? "n/a"}
                </div>
                <div>Memory source: {metrics?.memory.source ?? "n/a"}</div>
                <div>Memory accounting: {metrics?.memory.accounting ?? "n/a"}</div>
                <div>
                  Memory pressure raw: {metrics?.memory.pressureLevel ?? "unavailable"}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
