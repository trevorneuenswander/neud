"use client";

import { useEffect, useRef, useState } from "react";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";

/**
 * Tracks Electron graceful shutdown so UI can freeze last-known state and
 * ignore teardown-induced fetch/IPC failures.
 */
export function useAppShutdown(): boolean {
  const [shuttingDown, setShuttingDown] = useState(false);
  const shuttingDownRef = useRef(false);

  useEffect(() => {
    if (!isDesktopEnvironment()) return;
    const api = getDesktopAPI()?.app;
    if (!api?.onLifecycle) return;

    return api.onLifecycle((payload) => {
      if (payload.phase !== "shutting-down") return;
      if (shuttingDownRef.current) return;
      shuttingDownRef.current = true;
      setShuttingDown(true);
      try {
        document.documentElement.dataset.neudShutdown = "1";
      } catch {
        // ignore
      }
    });
  }, []);

  return shuttingDown;
}

export function isAppShuttingDown(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.neudShutdown === "1";
}
