"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  probeInternetConnectivityPresentation,
  type InternetConnectivityPresentation,
} from "@/lib/connectivity/internet-connection";
import { shouldRunDesktopConnectivityProbe } from "@/lib/connectivity/should-run-desktop-connectivity-probe";
import { localFetch } from "@/lib/local/api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

const RECHECK_INTERVAL_MS = 30_000;

const HOSTED_IDLE_PRESENTATION: InternetConnectivityPresentation = {
  label: "Online",
  tone: "success",
};

export type ConnectivityPresentation = InternetConnectivityPresentation;

export function useConnectivityPresentation(): InternetConnectivityPresentation {
  const probeEnabled = shouldRunDesktopConnectivityProbe();
  const [presentation, setPresentation] = useState<InternetConnectivityPresentation>(() =>
    probeEnabled
      ? {
          label: "Offline",
          tone: "destructive",
        }
      : HOSTED_IDLE_PRESENTATION,
  );
  const probeRequestRef = useRef(0);
  const previousOnlineRef = useRef<boolean | null>(null);
  const presentationRef = useRef<InternetConnectivityPresentation>({
    label: "Offline",
    tone: "destructive",
  });

  const maybeRecoverSession = useCallback((next: InternetConnectivityPresentation) => {
    if (!shouldUseLocalDataClient()) {
      return;
    }

    const isOnline = next.label === "Online";
    if (previousOnlineRef.current === false && isOnline) {
      void localFetch("/api/auth/recover-session", {
        method: "POST",
        timeoutMs: 8_000,
      }).catch(() => {
        // Recovery validation is best-effort and cooldown-protected server-side.
      });
    }
    previousOnlineRef.current = isOnline;
  }, []);

  const runProbe = useCallback(async () => {
    const requestId = probeRequestRef.current + 1;
    probeRequestRef.current = requestId;

    const next = await probeInternetConnectivityPresentation(presentationRef.current);
    if (probeRequestRef.current !== requestId) {
      return;
    }

    presentationRef.current = next;
    setPresentation(next);
    maybeRecoverSession(next);
  }, [maybeRecoverSession]);

  useEffect(() => {
    if (!probeEnabled) {
      return;
    }

    void runProbe();

    const handleBrowserOffline = () => {
      const next: InternetConnectivityPresentation = {
        label: "Offline",
        tone: "destructive",
        detail: "Network interface: offline.",
        lastCheckedAt: new Date().toISOString(),
        browserOnline: false,
        reachabilityProbeSucceeded: false,
      };
      presentationRef.current = next;
      setPresentation(next);
      maybeRecoverSession(next);
    };

    const handleBrowserOnline = () => {
      void runProbe();
    };

    const handleFocus = () => {
      void runProbe();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runProbe();
      }
    };

    window.addEventListener("offline", handleBrowserOffline);
    window.addEventListener("online", handleBrowserOnline);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const intervalId = window.setInterval(() => {
      void runProbe();
    }, RECHECK_INTERVAL_MS);

    return () => {
      probeRequestRef.current += 1;
      window.clearInterval(intervalId);
      window.removeEventListener("offline", handleBrowserOffline);
      window.removeEventListener("online", handleBrowserOnline);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [maybeRecoverSession, probeEnabled, runProbe]);

  return presentation;
}

/** @deprecated Prefer useConnectivityPresentation for the footer internet indicator. */
export function useInternetConnection(): "checking" | "online" | "offline" {
  const presentation = useConnectivityPresentation();
  if (presentation.label === "Online") {
    return "online";
  }
  return "offline";
}
