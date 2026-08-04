"use client";

import { useCallback, useEffect, useState } from "react";
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

    setLoading(true);
    try {
      const next = await localGetOnlineViewerSettings(projectSlug, displayId);
      applySettings(next);
      setLoadError(null);
    } catch (error) {
      setSettings(null);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load online viewer settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [applySettings, displayId, isDesktop, projectSlug]);

  useEffect(() => {
    void refresh();
  }, [displayEnabled, refresh]);

  const toggleEnabled = useCallback(
    async (nextEnabled: boolean) => {
      if (!canManage || !isDesktop || loading || !displayEnabled) {
        return;
      }

      const previousEnabled = enabled;
      const previousSettings = settings;
      setEnabled(nextEnabled);
      setBusy(true);
      setLoadError(null);

      try {
        const next = await localUpdateOnlineViewerSettings(projectSlug, displayId, {
          onlineViewerEnabled: nextEnabled,
        });
        applySettings(next);
      } catch (error) {
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
        setBusy(false);
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
