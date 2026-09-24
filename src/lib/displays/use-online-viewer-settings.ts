"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isDesktopRuntimeClient } from "@/lib/runtime/environment";
import {
  localGetOnlineViewerSettings,
  localUpdateOnlineViewerSettings,
  type OnlineViewerSettings,
} from "@/lib/local/online-viewer-api";

export const ONLINE_VIEWER_DISPLAY_DISABLED_REASON =
  "Enable the display before turning on Online Viewer.";

export type UseOnlineViewerSettingsResult = {
  settings: OnlineViewerSettings | null;
  enabled: boolean;
  visibility: "private" | "public";
  loading: boolean;
  busy: boolean;
  loadError: string | null;
  unavailableReason: string | null;
  toggleEnabled: (nextEnabled: boolean) => Promise<void>;
  refresh: () => Promise<void>;
};

export function useOnlineViewerSettings(
  projectSlug: string,
  displayId: string,
  canManage = false,
  displayEnabled = true,
): UseOnlineViewerSettingsResult {
  const [settings, setSettings] = useState<OnlineViewerSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mutationGenerationRef = useRef(0);
  const busyRef = useRef(false);
  busyRef.current = busy;

  const isDesktop = isDesktopRuntimeClient();
  const displayBlockedReason = !displayEnabled
    ? ONLINE_VIEWER_DISPLAY_DISABLED_REASON
    : null;
  const unavailableReason = !isDesktop
    ? "Online Viewer is managed from the NEUD desktop app."
    : displayBlockedReason ?? loadError;

  const applySettings = useCallback((next: OnlineViewerSettings) => {
    setSettings(next);
    setEnabled(next.onlineViewerEnabled);
    setVisibility(next.onlineVisibility);
  }, []);

  const refresh = useCallback(async () => {
    if (!projectSlug || !displayId) {
      setLoading(false);
      return;
    }

    if (!isDesktop) {
      setSettings(null);
      setLoading(false);
      setLoadError("Online Viewer is managed from the NEUD desktop app.");
      return;
    }

    const generationAtStart = mutationGenerationRef.current;
    setLoading(true);
    try {
      const next = await localGetOnlineViewerSettings(projectSlug, displayId);
      if (generationAtStart !== mutationGenerationRef.current) {
        return;
      }
      applySettings(next);
      setLoadError(null);
    } catch (error) {
      if (generationAtStart !== mutationGenerationRef.current) {
        return;
      }
      setSettings(null);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load online viewer settings.",
      );
    } finally {
      if (generationAtStart === mutationGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [applySettings, displayId, isDesktop, projectSlug]);

  useEffect(() => {
    if (busyRef.current) {
      return;
    }
    void refresh();
  }, [displayId, isDesktop, projectSlug, refresh]);

  useEffect(() => {
    if (!displayEnabled) {
      setEnabled(false);
    }
  }, [displayEnabled]);

  const toggleEnabled = useCallback(
    async (nextEnabled: boolean) => {
      if (!canManage || !isDesktop || loading || !displayEnabled) {
        return;
      }

      const previousEnabled = enabled;
      const previousSettings = settings;
      const generation = ++mutationGenerationRef.current;
      setEnabled(nextEnabled);
      setBusy(true);
      setLoadError(null);

      try {
        const next = await localUpdateOnlineViewerSettings(projectSlug, displayId, {
          onlineViewerEnabled: nextEnabled,
        });
        if (generation !== mutationGenerationRef.current) {
          return;
        }
        applySettings(next);
      } catch (error) {
        if (generation !== mutationGenerationRef.current) {
          return;
        }
        setEnabled(previousEnabled);
        if (previousSettings) {
          setSettings(previousSettings);
        }
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to update online viewer settings.",
        );
      } finally {
        if (generation === mutationGenerationRef.current) {
          setBusy(false);
        }
      }
    },
    [
      applySettings,
      canManage,
      displayId,
      displayEnabled,
      enabled,
      isDesktop,
      loading,
      projectSlug,
      settings,
    ],
  );

  return {
    settings,
    enabled,
    visibility,
    loading,
    busy,
    loadError,
    unavailableReason,
    toggleEnabled,
    refresh,
  };
}
