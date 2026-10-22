"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectOnAirSourceToggle } from "@/components/projects/ProjectOnAirSourceToggle";
import {
  applyAuthoritativeSemaSourceMode,
  emitSemaSourceMode,
  subscribeToSemaSourceMode,
} from "@/lib/sema/sema-source-mode-client";
import {
  fetchSemaState,
  postSemaAction,
  type SemaControllerState,
} from "@/graphics/sema-schedule/schedule-api";

const SEMA_SOURCE_OPTIONS = [
  { value: "google-sheets" as const, label: "Data Source" },
  { value: "manual" as const, label: "Manual Controller" },
];

type SemaProjectSourceControlsProps = {
  projectSlug: string;
};

/**
 * SEMA top-bar on-air source selector.
 * Switches canonical sourceMode without navigating away from the current page.
 */
export function SemaProjectSourceControls({ projectSlug }: SemaProjectSourceControlsProps) {
  const [sourceMode, setSourceMode] = useState<"google-sheets" | "manual">("google-sheets");
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingGeneration = useRef(0);

  const applyState = useCallback(
    (next: SemaControllerState) => {
      const mode = next.sourceMode === "manual" ? "manual" : "google-sheets";
      applyAuthoritativeSemaSourceMode(projectSlug, mode, pendingGeneration.current);
      setSourceMode(mode);
      setHydrated(true);
    },
    [projectSlug],
  );

  useEffect(() => {
    return subscribeToSemaSourceMode(projectSlug, (mode) => {
      setSourceMode(mode);
      setHydrated(true);
    });
  }, [projectSlug]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await fetchSemaState(projectSlug);
        if (!cancelled) applyState(next);
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
  }, [applyState, projectSlug]);

  async function selectSource(mode: "google-sheets" | "manual") {
    if (busy || mode === sourceMode) return;
    const previous = sourceMode;
    const generation = emitSemaSourceMode(projectSlug, mode);
    pendingGeneration.current = generation;
    setSourceMode(mode);
    setBusy(true);
    setError(null);
    try {
      const next = await postSemaAction<SemaControllerState>(projectSlug, "source", { mode });
      applyState(next);
    } catch (cause) {
      pendingGeneration.current = emitSemaSourceMode(projectSlug, previous);
      setSourceMode(previous);
      setError(
        cause instanceof Error ? cause.message : "Unable to change the on-air source.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <ProjectOnAirSourceToggle
        options={SEMA_SOURCE_OPTIONS}
        value={sourceMode}
        disabled={!hydrated || busy}
        ariaLabel="SEMA on-air data source"
        onSelect={(mode) => {
          void selectSource(mode);
        }}
      />
      {error ? <p className="max-w-xs text-right text-xs text-danger">{error}</p> : null}
    </div>
  );
}
