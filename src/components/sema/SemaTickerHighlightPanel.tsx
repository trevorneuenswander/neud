"use client";

import { useEffect, useState } from "react";
import { SemaHighlightControls } from "@/components/sema/SemaHighlightControls";
import {
  fetchSemaState,
  type SemaControllerState,
} from "@/graphics/sema-schedule/schedule-api";

const REFRESH_INTERVAL_MS = 4_000;

/**
 * Highlight controls for Schedule Ticker display management cards.
 * Shares the same authoritative SEMA controller Highlight state as Manual Controller.
 */
export function SemaTickerHighlightPanel({
  projectSlug,
  canControl = true,
}: {
  projectSlug: string;
  canControl?: boolean;
}) {
  const [state, setState] = useState<SemaControllerState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await fetchSemaState(projectSlug);
        if (cancelled) return;
        setState(next);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Unable to load Highlight state.");
      }
    };
    const first = setTimeout(() => void poll(), 0);
    const timer = setInterval(() => void poll(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [projectSlug]);

  if (error && !state) {
    return <p className="text-xs text-destructive">{error}</p>;
  }
  if (!state) {
    return <p className="text-xs text-muted">Loading Highlight controls…</p>;
  }

  return (
    <SemaHighlightControls
      projectSlug={projectSlug}
      state={state}
      canControl={canControl}
      compact
      onState={setState}
    />
  );
}
