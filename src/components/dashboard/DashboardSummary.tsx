"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { localFetch } from "@/lib/local/api";
import type { DashboardData } from "@/lib/dashboard/types";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type DashboardSummaryProps = {
  projectCount: number | null;
  initialOnlineDisplays: number;
  initialRunningEngines: number;
};

export function DashboardSummary({
  projectCount,
  initialOnlineDisplays,
  initialRunningEngines,
}: DashboardSummaryProps) {
  const [onlineDisplays, setOnlineDisplays] = useState(initialOnlineDisplays);
  const [runningEngines, setRunningEngines] = useState(initialRunningEngines);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const dashboard = await localFetch<DashboardData>("/api/dashboard?limit=1");
        if (cancelled) return;
        setOnlineDisplays(dashboard.onlineDisplays);
        setRunningEngines(dashboard.runningEngines);
      } catch {
        // Keep the last known values.
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard
        label="Projects"
        value={projectCount !== null ? String(projectCount) : "—"}
        detail={projectCount !== null ? "Visible to you" : "Unavailable"}
        state={projectCount !== null ? "default" : "unavailable"}
      />
      <StatCard
        label="Online Displays"
        value={shouldUseLocalDataClient() ? String(onlineDisplays) : "—"}
        detail="Enabled displays across your projects"
        state={shouldUseLocalDataClient() ? "default" : "unavailable"}
      />
      <StatCard
        label="Running Engines"
        value={shouldUseLocalDataClient() ? String(runningEngines) : "—"}
        detail="Starting, running, or ready"
        state={shouldUseLocalDataClient() ? "default" : "unavailable"}
      />
    </div>
  );
}
