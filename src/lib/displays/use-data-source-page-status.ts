"use client";

import { useEffect, useState } from "react";
import type { DisplayDataSource } from "@/lib/displays/display-data-source";
import {
  getDesktopDisplayDataSource,
  subscribeToDesktopDisplayDataSource,
} from "@/lib/desktop/display-data-source-client";

export function useDataSourcePageStatus(
  pageSource: DisplayDataSource,
): "live" | "offline" {
  const [selectedSource, setSelectedSource] = useState<DisplayDataSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getDesktopDisplayDataSource()
      .then((source) => {
        if (!cancelled) setSelectedSource(source);
      })
      .catch(() => {
        if (!cancelled) setSelectedSource("webpage-scraper");
      });
    return subscribeToDesktopDisplayDataSource((source) => {
      setSelectedSource(source);
    });
  }, []);

  // Avoid flashing LIVE for Webpage Scraper before the real selection hydrates.
  if (selectedSource == null) return "offline";
  return selectedSource === pageSource ? "live" : "offline";
}

export function isDataSourcePageLive(
  pageSource: DisplayDataSource,
  selectedSource: DisplayDataSource,
): boolean {
  return selectedSource === pageSource;
}
