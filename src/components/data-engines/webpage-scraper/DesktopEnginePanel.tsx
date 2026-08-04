"use client";

import { useEffect, useState } from "react";
import type { DataEngine } from "@/lib/data-engines/types";
import {
  getDesktopEngineStatus,
  isDesktopEnvironment,
  shouldUseLocalDesktopEngine,
} from "@/lib/desktop/client";
import type { LocalEngineStatus } from "@/lib/desktop/types";

type DesktopExecutionPanelProps = {
  projectType: string;
  engine: DataEngine;
};

export function DesktopExecutionPanel({
  projectType: _projectType,
  engine,
}: DesktopExecutionPanelProps) {
  const [localStatus, setLocalStatus] = useState<LocalEngineStatus | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDesktop = mounted && isDesktopEnvironment();
  const useLocal = mounted && shouldUseLocalDesktopEngine(engine);

  useEffect(() => {
    if (!isDesktop || !useLocal) return;

    void getDesktopEngineStatus(engine.id).then(setLocalStatus);

    const interval = window.setInterval(() => {
      void getDesktopEngineStatus(engine.id).then(setLocalStatus);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [engine.id, isDesktop, useLocal]);

  return (
    <div className="rounded-lg border border-border bg-surface-raised/40 p-4 space-y-2">
      <p className="text-sm font-medium text-foreground">Desktop Execution</p>
      <p className="text-sm text-muted">
        The scraper runs locally on this computer. Keep the desktop app open while it is
        running.
      </p>
      {!isDesktop || !useLocal ? (
        <p className="text-xs text-muted">
          Open this project in the NEUD desktop app to start the scraper.
        </p>
      ) : null}
      {localStatus?.pid ? (
        <p className="text-xs text-muted">
          Local process PID {localStatus.pid} · {localStatus.state}
        </p>
      ) : null}
    </div>
  );
}
