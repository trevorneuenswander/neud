"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatAuctionDayFilterLabel,
  type AuctionDayFilter,
} from "@/lib/bag/auction-day-from-lot";
import {
  readSessionStreamTickerDayFilter,
  writeSessionStreamTickerDayFilter,
} from "@/lib/bag/stream-ticker-day-filter";
import {
  localGetStreamTickerDayFilter,
  localSetStreamTickerDayFilter,
} from "@/lib/local/stream-ticker-filter-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { notifyDisplayBridgeDataChanged } from "@/lib/displays/display-connection-client";

type StreamTickerDayFilterControlProps = {
  projectSlug: string;
  projectId: string;
  displayId: string;
  sessionUserId?: string | null;
};

export function StreamTickerDayFilterControl({
  projectSlug,
  projectId,
  displayId,
  sessionUserId = null,
}: StreamTickerDayFilterControlProps) {
  const [dayFilter, setDayFilter] = useState<AuctionDayFilter>(() =>
    readSessionStreamTickerDayFilter(sessionUserId, projectId),
  );
  const [detectedAuctionDays, setDetectedAuctionDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const loadFilter = useCallback(async () => {
    if (!shouldUseLocalDataClient()) {
      return;
    }
    try {
      const payload = await localGetStreamTickerDayFilter(projectSlug);
      setDayFilter(payload.filter);
      writeSessionStreamTickerDayFilter(sessionUserId, projectId, payload.filter);
      const detected = payload.diagnostics?.detectedAuctionDays;
      if (Array.isArray(detected)) {
        setDetectedAuctionDays(
          detected.filter((day): day is number => typeof day === "number"),
        );
      }
    } catch {
      setDayFilter(readSessionStreamTickerDayFilter(sessionUserId, projectId));
    }
  }, [projectId, projectSlug, sessionUserId]);

  useEffect(() => {
    void loadFilter();
  }, [loadFilter]);

  const options = useMemo(() => {
    const days = [...detectedAuctionDays].sort((left, right) => left - right);
    return days;
  }, [detectedAuctionDays]);

  async function handleChange(value: string) {
    const nextFilter: AuctionDayFilter =
      value === "all" ? "all" : Number.parseInt(value, 10);
    setDayFilter(nextFilter);
    writeSessionStreamTickerDayFilter(sessionUserId, projectId, nextFilter);
    if (!shouldUseLocalDataClient()) {
      return;
    }
    setSaving(true);
    try {
      const result = await localSetStreamTickerDayFilter(projectSlug, nextFilter);
      setDayFilter(result.filter);
      setDetectedAuctionDays(result.detectedAuctionDays);
      writeSessionStreamTickerDayFilter(sessionUserId, projectId, result.filter);
      notifyDisplayBridgeDataChanged(displayId, result.displayDataRevision ?? null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={dayFilter === "all" ? "all" : String(dayFilter)}
      onChange={(event) => void handleChange(event.target.value)}
      disabled={saving}
      className="h-9 min-w-[7.5rem] rounded-md border border-border bg-surface px-2 text-sm text-foreground"
      aria-label="Filter Stream Ticker lots by auction day"
    >
      <option value="all">{formatAuctionDayFilterLabel("all")}</option>
      {options.map((day) => (
        <option key={day} value={String(day)}>
          {formatAuctionDayFilterLabel(day)}
        </option>
      ))}
    </select>
  );
}
