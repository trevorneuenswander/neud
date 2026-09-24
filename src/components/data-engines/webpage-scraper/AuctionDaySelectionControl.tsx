"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatAuctionDayFilterLabel,
  type AuctionDayFilter,
} from "@/lib/bag/auction-day-from-lot";
import {
  localGetAuctionDaySelection,
  localSetAuctionDaySelection,
} from "@/lib/local/auction-day-selection-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { notifyDisplayBridgeDataChanged } from "@/lib/displays/display-connection-client";

type AuctionDaySelectionControlProps = {
  projectSlug: string;
  projectId: string;
  displayId?: string | null;
  showLabel?: boolean;
  className?: string;
  onChanged?: (filter: AuctionDayFilter) => void;
};

export function AuctionDaySelectionControl({
  projectSlug,
  projectId,
  displayId = null,
  showLabel = false,
  className = "",
  onChanged,
}: AuctionDaySelectionControlProps) {
  const [dayFilter, setDayFilter] = useState<AuctionDayFilter>("all");
  const [detectedAuctionDays, setDetectedAuctionDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const loadFilter = useCallback(async () => {
    if (!shouldUseLocalDataClient()) {
      return;
    }
    try {
      const payload = await localGetAuctionDaySelection(projectSlug);
      setDayFilter(payload.filter);
      onChanged?.(payload.filter);
      if (Array.isArray(payload.detectedAuctionDays)) {
        setDetectedAuctionDays(
          payload.detectedAuctionDays.filter(
            (day): day is number => typeof day === "number",
          ),
        );
      } else {
        const detected = payload.diagnostics?.detectedAuctionDays;
        if (Array.isArray(detected)) {
          setDetectedAuctionDays(
            detected.filter((day): day is number => typeof day === "number"),
          );
        }
      }
    } catch {
      setDayFilter("all");
    }
  }, [onChanged, projectSlug]);

  useEffect(() => {
    void loadFilter();
    if (!shouldUseLocalDataClient()) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadFilter();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadFilter, projectId]);

  const options = useMemo(
    () => [...detectedAuctionDays].sort((left, right) => left - right),
    [detectedAuctionDays],
  );

  async function handleChange(value: string) {
    const nextFilter: AuctionDayFilter =
      value === "all" ? "all" : Number.parseInt(value, 10);
    setDayFilter(nextFilter);
    onChanged?.(nextFilter);
    if (!shouldUseLocalDataClient()) {
      return;
    }
    setSaving(true);
    try {
      const result = await localSetAuctionDaySelection(projectSlug, nextFilter);
      setDayFilter(result.filter);
      setDetectedAuctionDays(result.detectedAuctionDays);
      onChanged?.(result.filter);
      if (displayId) {
        notifyDisplayBridgeDataChanged(displayId, result.displayDataRevision ?? null);
      }
    } finally {
      setSaving(false);
    }
  }

  const select = (
    <select
      value={dayFilter === "all" ? "all" : String(dayFilter)}
      onChange={(event) => void handleChange(event.target.value)}
      disabled={saving}
      className={`h-9 rounded-md border border-border bg-surface px-2 text-left text-sm text-foreground ${className}`.trim()}
      aria-label="Auction day selection"
    >
      <option value="all">{formatAuctionDayFilterLabel("all")}</option>
      {options.map((day) => (
        <option key={day} value={String(day)}>
          {formatAuctionDayFilterLabel(day)}
        </option>
      ))}
    </select>
  );

  if (!showLabel) {
    return select;
  }

  return (
    <label className={`grid gap-1 text-sm ${className}`.trim()}>
      <span className="text-muted">Auction Day</span>
      {select}
    </label>
  );
}
