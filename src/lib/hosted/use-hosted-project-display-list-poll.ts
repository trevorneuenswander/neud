"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  mapActiveDisplayToCardDisplay,
  type HostedDisplayCardDisplay,
} from "@/lib/hosted/hosted-display-snapshot";

const DEFAULT_STATUS_POLL_MS = 3000;

type HostedActiveDisplayRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  display_width: number | null;
  display_height: number | null;
  enabled: boolean;
  online_viewer_enabled: boolean;
  online_visibility: "private" | "public";
  online_published_at: string | null;
  online_published_revision_id: string | null;
  online_publish_error: string | null;
  refresh_rate_ms: number | null;
  sort_order: number | null;
};

export type HostedProjectDisplayListPollDiagnostics = {
  lastStatusPollAttemptAt: string | null;
  lastStatusPollSuccessAt: string | null;
  statusPollErrorCategory: string | null;
  statusChangedWithoutReload: boolean;
};

type UseHostedProjectDisplayListPollOptions = {
  projectId: string;
  initialDisplays: HostedDisplayCardDisplay[];
  enabled?: boolean;
  pollIntervalMs?: number;
};

type UseHostedProjectDisplayListPollResult = {
  displays: HostedDisplayCardDisplay[];
  diagnostics: HostedProjectDisplayListPollDiagnostics;
  refreshIssue: boolean;
};

function mergeDisplayLists(
  previous: HostedDisplayCardDisplay[],
  incoming: HostedDisplayCardDisplay[],
): HostedDisplayCardDisplay[] {
  const incomingById = new Map(incoming.map((display) => [display.id, display]));
  const merged = previous.map((display) => incomingById.get(display.id) ?? display);

  for (const display of incoming) {
    if (!merged.some((entry) => entry.id === display.id)) {
      merged.push(display);
    }
  }

  return merged;
}

function displaysChanged(
  previous: HostedDisplayCardDisplay[],
  next: HostedDisplayCardDisplay[],
): boolean {
  if (previous.length !== next.length) {
    return true;
  }

  for (const display of next) {
    const prior = previous.find((entry) => entry.id === display.id);
    if (!prior) {
      return true;
    }

    if (
      prior.enabled !== display.enabled ||
      prior.online_viewer_enabled !== display.online_viewer_enabled ||
      prior.online_published_revision_id !== display.online_published_revision_id ||
      prior.online_published_at !== display.online_published_at ||
      prior.online_publish_error !== display.online_publish_error ||
      prior.online_visibility !== display.online_visibility ||
      prior.refresh_rate_ms !== display.refresh_rate_ms
    ) {
      return true;
    }
  }

  return false;
}

export function useHostedProjectDisplayListPoll({
  projectId,
  initialDisplays,
  enabled = true,
  pollIntervalMs = DEFAULT_STATUS_POLL_MS,
}: UseHostedProjectDisplayListPollOptions): UseHostedProjectDisplayListPollResult {
  const supabase = useRef(createClient()).current;
  const lastGoodDisplaysRef = useRef<HostedDisplayCardDisplay[]>(initialDisplays);
  const [displays, setDisplays] = useState(initialDisplays);
  const [refreshIssue, setRefreshIssue] = useState(false);
  const [diagnostics, setDiagnostics] = useState<HostedProjectDisplayListPollDiagnostics>({
    lastStatusPollAttemptAt: null,
    lastStatusPollSuccessAt: null,
    statusPollErrorCategory: null,
    statusChangedWithoutReload: false,
  });

  const poll = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const attemptedAt = new Date().toISOString();
    setDiagnostics((current) => ({
      ...current,
      lastStatusPollAttemptAt: attemptedAt,
    }));

    const { data, error } = await supabase.rpc("list_project_active_displays", {
      p_project_id: projectId,
    });

    if (error || !Array.isArray(data)) {
      setRefreshIssue(true);
      setDiagnostics((current) => ({
        ...current,
        statusPollErrorCategory: error?.code ?? "list_project_active_displays_failed",
      }));
      return;
    }

    const incoming = (data as HostedActiveDisplayRow[]).map(mapActiveDisplayToCardDisplay);
    const merged = mergeDisplayLists(lastGoodDisplaysRef.current, incoming);
    const changed = displaysChanged(lastGoodDisplaysRef.current, merged);
    lastGoodDisplaysRef.current = merged;
    setDisplays(merged);
    setRefreshIssue(false);
    setDiagnostics((current) => ({
      ...current,
      lastStatusPollSuccessAt: new Date().toISOString(),
      statusPollErrorCategory: null,
      statusChangedWithoutReload: current.statusChangedWithoutReload || changed,
    }));
  }, [enabled, projectId, supabase]);

  useEffect(() => {
    lastGoodDisplaysRef.current = initialDisplays;
    setDisplays(initialDisplays);
  }, [initialDisplays]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, pollIntervalMs);

    return () => window.clearInterval(interval);
  }, [enabled, poll, pollIntervalMs]);

  return {
    displays,
    diagnostics,
    refreshIssue,
  };
}
