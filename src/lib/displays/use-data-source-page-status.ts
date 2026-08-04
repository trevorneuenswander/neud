"use client";

import { useEffect, useState } from "react";
import type { DisplayDataSource } from "@/lib/displays/display-data-source";
import { subscribeToDesktopDisplayDataSource } from "@/lib/desktop/display-data-source-client";

export function useDataSourcePageStatus(
  pageSource: DisplayDataSource,
): "live" | "offline" {
  const [selectedSource, setSelectedSource] =
    useState<DisplayDataSource>("webpage-scraper");

  useEffect(() => subscribeToDesktopDisplayDataSource(setSelectedSource), []);

  return selectedSource === pageSource ? "live" : "offline";
}

export function isDataSourcePageLive(
  pageSource: DisplayDataSource,
  selectedSource: DisplayDataSource,
): boolean {
  return selectedSource === pageSource;
}
