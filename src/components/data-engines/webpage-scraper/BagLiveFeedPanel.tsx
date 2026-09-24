"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { formatRelativeTime } from "@/lib/data-engines/format";
import { liveFeedModeUiLabel, normalizeLiveFeedModePreference } from "@/lib/bag/live-feed-mode-labels";
import {
  BACKGROUND_REFRESH_PRESETS_MS,
  LEGACY_POLL_PRESETS_MS,
} from "@/lib/bag/scraper-timing-presets";
import type { LiveFeedModePreference } from "@/lib/local/live-feed-mode-api";
import {
  localGetLiveFeedMode,
  localSetLiveFeedMode,
} from "@/lib/local/live-feed-mode-api";
import { localUpdateScraperSettings } from "@/lib/local/api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { AuctionDaySelectionControl } from "@/components/data-engines/webpage-scraper/AuctionDaySelectionControl";
import { ScraperIntervalSliderControl } from "@/components/data-engines/webpage-scraper/ScraperIntervalSliderControl";
import type { WebpageScraperSettings } from "@/lib/data-engines/types";

type LiveFeedRuntime = {
  liveFeedMode?: string;
  liveFeedActiveSource?: string;
  liveFeedModePreference?: string;
  liveFeedHealth?: string;
  liveDataLatencyMs?: number | null;
  lastLiveUpdateAt?: string | null;
};

function formatHealth(health: string | undefined) {
  switch (health) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "recovering":
      return "Recovering";
    case "offline":
      return "Offline";
    default:
      return "Unknown";
  }
}

export function BagLiveFeedPanel({
  projectSlug,
  projectId,
  engineId,
  scraperSettings,
  liveFeed,
  configuredMode,
  pollIntervalMs,
  onModeChanged,
  onPollIntervalChange,
  onSettingsPersisted,
}: {
  projectSlug: string;
  projectId: string;
  engineId: string;
  scraperSettings: WebpageScraperSettings;
  liveFeed: LiveFeedRuntime | null | undefined;
  configuredMode?: LiveFeedModePreference | null;
  pollIntervalMs: number;
  onModeChanged?: (mode: LiveFeedModePreference) => void;
  onPollIntervalChange?: (pollIntervalMs: number) => void;
  onSettingsPersisted?: () => void;
}) {
  const [modePreference, setModePreference] = useState<LiveFeedModePreference>(
    normalizeLiveFeedModePreference(configuredMode ?? "faye"),
  );
  const [savingMode, setSavingMode] = useState(false);
  const [intervalMs, setIntervalMs] = useState(pollIntervalMs);

  const showLegacyPoll = modePreference === "legacy";
  const legacyPresets = [...LEGACY_POLL_PRESETS_MS];
  const backgroundPresets = [...BACKGROUND_REFRESH_PRESETS_MS];

  useEffect(() => {
    if (configuredMode) {
      setModePreference(normalizeLiveFeedModePreference(configuredMode));
    }
  }, [configuredMode]);

  useEffect(() => {
    setIntervalMs(pollIntervalMs);
  }, [pollIntervalMs]);

  useEffect(() => {
    const active = liveFeed?.liveFeedActiveSource ?? liveFeed?.liveFeedMode;
    if (active === "faye" || active === "dom" || active === "legacy") {
      setModePreference(active);
      onModeChanged?.(active);
    }
  }, [liveFeed?.liveFeedActiveSource, liveFeed?.liveFeedMode, onModeChanged]);

  const loadMode = useCallback(async () => {
    if (!shouldUseLocalDataClient()) {
      return;
    }
    try {
      const payload = await localGetLiveFeedMode(projectSlug);
      const next = normalizeLiveFeedModePreference(payload.mode);
      setModePreference(next);
      onModeChanged?.(next);
    } catch {
      // Keep current selection.
    }
  }, [onModeChanged, projectSlug]);

  useEffect(() => {
    void loadMode();
  }, [loadMode]);

  async function handleModeChange(value: string) {
    const nextMode = normalizeLiveFeedModePreference(value);
    setModePreference(nextMode);
    onModeChanged?.(nextMode);
    if (!shouldUseLocalDataClient()) {
      return;
    }
    setSavingMode(true);
    try {
      const result = await localSetLiveFeedMode(projectSlug, nextMode);
      const normalized = normalizeLiveFeedModePreference(result.mode);
      setModePreference(normalized);
      onModeChanged?.(normalized);
    } finally {
      setSavingMode(false);
    }
  }

  const persistInterval = useCallback(
    async (nextMs: number) => {
      if (nextMs === intervalMs) {
        return;
      }
      const previousMs = intervalMs;
      setIntervalMs(nextMs);
      onPollIntervalChange?.(nextMs);
      if (!shouldUseLocalDataClient()) {
        return;
      }
      try {
        await localUpdateScraperSettings(engineId, {
          pollIntervalMs: nextMs,
          detailsTtlMs: scraperSettings.details_ttl_ms,
          maxDetailChecksPerPoll: scraperSettings.max_detail_checks_per_poll,
          headless: scraperSettings.headless,
        });
        onSettingsPersisted?.();
      } catch (error) {
        setIntervalMs(previousMs);
        onPollIntervalChange?.(previousMs);
        throw error;
      }
    },
    [
      engineId,
      intervalMs,
      onPollIntervalChange,
      onSettingsPersisted,
      scraperSettings.details_ttl_ms,
      scraperSettings.headless,
      scraperSettings.max_detail_checks_per_poll,
    ],
  );

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Live Feed</h3>
          <select
            value={modePreference}
            onChange={(event) => void handleModeChange(event.target.value)}
            disabled={savingMode}
            className="h-9 min-w-[11rem] rounded-md border border-border bg-surface px-2 text-left text-sm text-foreground"
            aria-label="Live feed mode"
          >
            <option value="faye">{liveFeedModeUiLabel("faye")}</option>
            <option value="dom">{liveFeedModeUiLabel("dom")}</option>
            <option value="legacy">{liveFeedModeUiLabel("legacy")}</option>
          </select>
          <AuctionDaySelectionControl
            projectSlug={projectSlug}
            projectId={projectId}
            showLabel={false}
            className="min-w-[9.5rem]"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Status</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {formatHealth(liveFeed?.liveFeedHealth)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Live data latency
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {typeof liveFeed?.liveDataLatencyMs === "number"
                ? `${Math.round(liveFeed.liveDataLatencyMs)} ms`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Last live update
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {liveFeed?.lastLiveUpdateAt
                ? formatRelativeTime(liveFeed.lastLiveUpdateAt)
                : "—"}
            </p>
          </div>
        </div>

        <div className="pt-4">
        <ScraperIntervalSliderControl
          title={showLegacyPoll ? "Poll Interval" : "Background Refresh"}
          intervalMs={intervalMs}
          presets={showLegacyPoll ? legacyPresets : backgroundPresets}
          mode={showLegacyPoll ? "legacy-poll" : "background-refresh"}
          disabled={savingMode}
          onIntervalChange={persistInterval}
        />
        </div>
      </div>
    </Card>
  );
}
