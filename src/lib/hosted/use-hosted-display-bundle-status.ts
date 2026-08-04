"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  parseViewerBundleRpcResult,
  type ParsedViewerBundle,
} from "@/lib/hosted/viewer-bundle";
import {
  resolveHostedDisplayStatusBadge,
  type HostedDisplayStatusBadge,
} from "@/lib/hosted/hosted-display-status";
import type { HostedDisplayStatusInput } from "@/lib/hosted/hosted-display-connection-status";
import { normalizeDisplayRefreshRateMs } from "@/lib/displays/refresh-rate";

type UseHostedDisplayBundleStatusOptions = {
  projectSlug: string;
  displaySlug: string;
  mode: "private" | "public";
  enabled?: boolean;
  refreshRateMs?: number | null;
  display?: HostedDisplayStatusInput | null;
};

export type HostedDisplayBundleStatus = HostedDisplayStatusBadge & {
  publisherOnline: boolean | null;
  sourceOffline: boolean | null;
  sourceConnected: boolean | null;
  canonicalDataPresent: boolean | null;
  viewerRpcCode: string | null;
  htmlPresent: boolean | null;
  pollError: boolean;
  refreshIssue: boolean;
};

type LastGoodBundleSnapshot = {
  publisherOnline: boolean;
  sourceOffline: boolean;
  sourceConnected: boolean;
  canonicalDataPresent: boolean;
  viewerRpcCode: string;
  htmlPresent: boolean;
};

function createInitialHostedDisplayBundleStatus(): HostedDisplayBundleStatus {
  return {
    ...resolveHostedDisplayStatusBadge({
      publisherOnline: null,
      sourceOffline: null,
      sourceConnected: null,
      canonicalDataPresent: null,
      pollError: false,
      hasLoadedBundle: false,
    }),
    publisherOnline: null,
    sourceOffline: null,
    sourceConnected: null,
    canonicalDataPresent: null,
    viewerRpcCode: null,
    htmlPresent: null,
    pollError: false,
    refreshIssue: false,
  };
}

export function useHostedDisplayBundleStatus({
  projectSlug,
  displaySlug,
  mode,
  enabled = true,
  refreshRateMs = null,
  display = null,
}: UseHostedDisplayBundleStatusOptions): HostedDisplayBundleStatus {
  const supabase = useRef(createClient()).current;
  const hasLoadedBundleRef = useRef(false);
  const lastGoodRef = useRef<LastGoodBundleSnapshot | null>(null);
  const [status, setStatus] = useState<HostedDisplayBundleStatus>(
    createInitialHostedDisplayBundleStatus,
  );

  const poll = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const { data, error } = await supabase.rpc("get_online_display_viewer_bundle", {
      p_project_slug: projectSlug,
      p_display_slug: displaySlug,
    });

    const parsed: ParsedViewerBundle = parseViewerBundleRpcResult(data, error);
    const pollError = !parsed.ok;

    if (parsed.ok) {
      hasLoadedBundleRef.current = true;
      lastGoodRef.current = {
        publisherOnline: parsed.publisherOnline,
        sourceOffline: parsed.sourceOffline,
        sourceConnected: parsed.sourceConnected,
        canonicalDataPresent: parsed.canonicalDataPresent,
        viewerRpcCode: parsed.code,
        htmlPresent: parsed.htmlContent.trim().length > 0,
      };
      setStatus({
        ...resolveHostedDisplayStatusBadge({
          publisherOnline: parsed.publisherOnline,
          sourceOffline: parsed.sourceOffline,
          sourceConnected: parsed.sourceConnected,
          canonicalDataPresent: parsed.canonicalDataPresent,
          pollError: false,
          hasLoadedBundle: true,
          viewerRpcCode: parsed.code,
          display,
        }),
        publisherOnline: parsed.publisherOnline,
        sourceOffline: parsed.sourceOffline,
        sourceConnected: parsed.sourceConnected,
        canonicalDataPresent: parsed.canonicalDataPresent,
        viewerRpcCode: parsed.code,
        htmlPresent: parsed.htmlContent.trim().length > 0,
        pollError: false,
        refreshIssue: false,
      });
      return;
    }

    const lastGood = lastGoodRef.current;
    if (hasLoadedBundleRef.current && lastGood) {
      setStatus({
        ...resolveHostedDisplayStatusBadge({
          publisherOnline: lastGood.publisherOnline,
          sourceOffline: lastGood.sourceOffline,
          sourceConnected: lastGood.sourceConnected,
          canonicalDataPresent: lastGood.canonicalDataPresent,
          pollError: true,
          hasLoadedBundle: true,
          viewerRpcCode: lastGood.viewerRpcCode,
          display,
        }),
        publisherOnline: lastGood.publisherOnline,
        sourceOffline: lastGood.sourceOffline,
        sourceConnected: lastGood.sourceConnected,
        canonicalDataPresent: lastGood.canonicalDataPresent,
        viewerRpcCode: lastGood.viewerRpcCode,
        htmlPresent: lastGood.htmlPresent,
        pollError: true,
        refreshIssue: true,
      });
      return;
    }

    setStatus({
      ...resolveHostedDisplayStatusBadge({
        publisherOnline: null,
        sourceOffline: null,
        sourceConnected: null,
        canonicalDataPresent: null,
        pollError,
        hasLoadedBundle: false,
        viewerRpcCode: parsed.code,
        display,
      }),
      publisherOnline: null,
      sourceOffline: null,
      sourceConnected: null,
      canonicalDataPresent: null,
      viewerRpcCode: parsed.code,
      htmlPresent: null,
      pollError,
      refreshIssue: false,
    });
  }, [display, displaySlug, enabled, projectSlug, supabase]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void poll();
    const intervalMs = normalizeDisplayRefreshRateMs(refreshRateMs ?? undefined);
    const interval = window.setInterval(() => {
      void poll();
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [enabled, poll, refreshRateMs]);

  return status;
}
