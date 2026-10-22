"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";

export type OutputTallySnapshot = {
  liveCount: number;
  recordingCount: number;
  startingCount: number;
  finalizingCount: number;
  errorCount: number;
  hasLive: boolean;
  hasRecording: boolean;
  inactive: boolean;
};

const EMPTY_TALLY: OutputTallySnapshot = {
  liveCount: 0,
  recordingCount: 0,
  startingCount: 0,
  finalizingCount: 0,
  errorCount: 0,
  hasLive: false,
  hasRecording: false,
  inactive: true,
};

function normalizeTally(value: unknown): OutputTallySnapshot {
  if (!value || typeof value !== "object") return EMPTY_TALLY;
  const record = value as Record<string, unknown>;
  const liveCount = Number(record.liveCount) || 0;
  const recordingCount = Number(record.recordingCount) || 0;
  const startingCount = Number(record.startingCount) || 0;
  const finalizingCount = Number(record.finalizingCount) || 0;
  const errorCount = Number(record.errorCount) || 0;
  return {
    liveCount,
    recordingCount,
    startingCount,
    finalizingCount,
    errorCount,
    hasLive: record.hasLive === true || liveCount > 0,
    hasRecording: record.hasRecording === true || recordingCount > 0,
    inactive:
      record.inactive === true ||
      (liveCount === 0 &&
        recordingCount === 0 &&
        startingCount === 0 &&
        finalizingCount === 0),
  };
}

function Indicator({
  label,
  count,
  active,
  warning,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  warning: boolean;
  tone: "live" | "rec";
}) {
  const activeClass =
    tone === "live"
      ? "text-success border-success/40 bg-success/10"
      : "text-danger border-danger/40 bg-danger/10";
  const warningClass = "text-warning border-warning/40 bg-warning/10";
  const inactiveClass = "text-muted border-border/60 bg-transparent opacity-50";

  return (
    <span
      data-tally-indicator={label}
      data-tally-active={active ? "true" : "false"}
      data-tally-warning={warning ? "true" : "false"}
      className={[
        "inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
        warning ? warningClass : active ? activeClass : inactiveClass,
      ].join(" ")}
    >
      <span>{label}</span>
      {count > 1 ? <span data-tally-count="">{count}</span> : null}
    </span>
  );
}

export function GlobalOutputTally() {
  const router = useRouter();
  const [desktop, setDesktop] = useState(false);
  const [tally, setTally] = useState<OutputTallySnapshot>(EMPTY_TALLY);

  useEffect(() => {
    setDesktop(isDesktopEnvironment());
  }, []);

  useEffect(() => {
    if (!desktop) return;
    const api = getDesktopAPI()?.output;
    if (!api?.getTally) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await api.getTally();
        if (!cancelled) setTally(normalizeTally(next));
      } catch {
        if (!cancelled) setTally(EMPTY_TALLY);
      }
    };

    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 1000);

    const unsubscribe =
      typeof api.onSessionChanged === "function"
        ? api.onSessionChanged((payload) => {
            if (payload != null) {
              setTally(normalizeTally(payload));
            } else {
              void refresh();
            }
          })
        : undefined;

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      unsubscribe?.();
    };
  }, [desktop]);

  if (!desktop) {
    return null;
  }

  const liveActive = tally.hasLive || tally.startingCount > 0;
  const recActive = tally.hasRecording || tally.finalizingCount > 0;
  const liveWarning = tally.startingCount > 0;
  const recWarning = tally.finalizingCount > 0 || (tally.startingCount > 0 && !tally.hasLive);

  return (
    <button
      type="button"
      data-global-output-tally=""
      data-tally-inactive={tally.inactive ? "true" : "false"}
      aria-label="Open Outputs"
      title="Outputs"
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={() => router.push("/outputs")}
    >
      <Indicator
        label="LIVE"
        count={tally.liveCount}
        active={liveActive}
        warning={liveWarning}
        tone="live"
      />
      <Indicator
        label="REC"
        count={tally.recordingCount}
        active={recActive}
        warning={recWarning}
        tone="rec"
      />
    </button>
  );
}
