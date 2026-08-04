"use client";

import { useEffect, useRef, useState } from "react";
import { EngineStatistics } from "@/components/data-engines/webpage-scraper/EngineStatistics";
import { localGetEngineDetail } from "@/lib/local/api";
import {
  localGetDisplayEnabled,
  localGetPylonDisplayEnabled,
} from "@/lib/local/displays-api";
import {
  buildDisplayRegistry,
  getEnabledDisplayCount,
  LOWER_TICKER_V5_DISPLAY_ID,
} from "@/lib/displays/registry";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import type {
  DataEngineLog,
  DataEngineSnapshot,
  DataEngineStatus,
  WebpageScraperSettings,
} from "@/lib/data-engines/types";

type OverviewEngineStatisticsProps = {
  engineId: string;
  initialStatus: DataEngineStatus | null;
  initialSettings: WebpageScraperSettings | null;
  initialRecentSnapshots: DataEngineSnapshot[];
  initialLogs: DataEngineLog[];
};

export function OverviewEngineStatistics({
  engineId,
  initialStatus,
  initialSettings,
  initialRecentSnapshots,
  initialLogs,
}: OverviewEngineStatisticsProps) {
  const [status, setStatus] = useState(initialStatus);
  const [settings, setSettings] = useState(initialSettings);
  const [recentSnapshots, setRecentSnapshots] = useState(initialRecentSnapshots);
  const [logs, setLogs] = useState(initialLogs);
  const [pylonEnabled, setPylonEnabled] = useState(true);
  const [lowerTickerEnabled, setLowerTickerEnabled] = useState(true);
  const originRef = useRef(
    typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000",
  );

  useEffect(() => {
    if (!shouldUseLocalDataClient()) return;

    void Promise.all([
      localGetPylonDisplayEnabled(),
      localGetDisplayEnabled(LOWER_TICKER_V5_DISPLAY_ID),
    ])
      .then(([pylon, lowerTicker]) => {
        setPylonEnabled(pylon.enabled);
        setLowerTickerEnabled(lowerTicker.enabled);
      })
      .catch(() => {
        // Keep default enabled states.
      });
  }, []);

  useEffect(() => {
    if (!shouldUseLocalDataClient() || !engineId) return;

    const refresh = () => {
      void localGetEngineDetail(engineId)
        .then((bundle) => {
          setStatus((bundle.status as DataEngineStatus | null | undefined) ?? null);
          setSettings(
            (bundle.settings as WebpageScraperSettings | null | undefined) ?? null,
          );
          setRecentSnapshots(
            (bundle.recentSnapshots as DataEngineSnapshot[] | undefined) ?? [],
          );
          setLogs((bundle.logs as DataEngineLog[] | undefined) ?? []);
        })
        .catch(() => {
          // Keep last good stats on transient local API failures.
        });
    };

    refresh();
    const interval = window.setInterval(refresh, 2000);
    return () => window.clearInterval(interval);
  }, [engineId]);

  if (!status) {
    return (
      <p className="text-sm text-muted">
        Scraper statistics will appear here once the Webpage Scraper has run.
      </p>
    );
  }

  const registry = buildDisplayRegistry({
    baseUrl: originRef.current,
    pylonEnabled,
    lowerTickerV5Enabled: lowerTickerEnabled,
  });
  const enabledDisplayCount = getEnabledDisplayCount(registry);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Scraper statistics</h3>
      <EngineStatistics
        status={status}
        pollIntervalMs={settings?.poll_interval_ms ?? null}
        recentSnapshots={recentSnapshots}
        logs={logs}
        enabledDisplayCount={enabledDisplayCount}
      />
    </div>
  );
}
