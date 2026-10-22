"use client";

import { useEffect, useState } from "react";
import { ConnectionStatusPill } from "@/components/ui/ConnectionStatusPill";
import { fetchSemaState } from "@/graphics/sema-schedule/schedule-api";
import {
  applyAuthoritativeSemaSourceMode,
  getSemaSourceModeSnapshot,
  subscribeToSemaSourceMode,
  type SemaOnAirSourceMode,
} from "@/lib/sema/sema-source-mode-client";

type SemaPageSource = SemaOnAirSourceMode;

type SemaSourceStatusPillProps = {
  projectSlug: string;
  /** Which page this pill represents (selection Live/Offline, not connectivity). */
  pageSource: SemaPageSource;
};

/**
 * Page-header Live/Offline bug for SEMA Data Source / Manual Controller pages.
 * Reflects on-air source selection only — not sheet connectivity health.
 * Updates immediately via shared optimistic source-mode events.
 */
export function SemaSourceStatusPill({ projectSlug, pageSource }: SemaSourceStatusPillProps) {
  const [selected, setSelected] = useState<SemaPageSource | null>(() => {
    return getSemaSourceModeSnapshot(projectSlug)?.mode ?? null;
  });

  useEffect(() => {
    return subscribeToSemaSourceMode(projectSlug, (mode) => {
      setSelected(mode);
    });
  }, [projectSlug]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const state = await fetchSemaState(projectSlug);
        if (cancelled) return;
        const mode: SemaOnAirSourceMode =
          state.sourceMode === "manual" ? "manual" : "google-sheets";
        applyAuthoritativeSemaSourceMode(projectSlug, mode);
        setSelected(getSemaSourceModeSnapshot(projectSlug)?.mode ?? mode);
      } catch {
        // Keep last known selection.
      }
    };
    const first = setTimeout(() => void poll(), 0);
    const timer = setInterval(() => void poll(), 5_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [projectSlug]);

  const status =
    selected == null ? "offline" : selected === pageSource ? "live" : "offline";
  const pageLabel = pageSource === "manual" ? "Manual Controller" : "Data Source";
  const isLive = status === "live";

  return (
    <ConnectionStatusPill
      status={status}
      title={
        selected == null
          ? `${pageLabel} status loading…`
          : isLive
            ? `LIVE — ${pageLabel} is the selected on-air source for displays.`
            : `OFFLINE — ${pageLabel} is not the selected on-air source for displays.`
      }
    />
  );
}
