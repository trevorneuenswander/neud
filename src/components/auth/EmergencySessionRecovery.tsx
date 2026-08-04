"use client";

import { useEffect } from "react";
import { forceLocalSignOut } from "@/lib/auth/force-local-sign-out";
import { isDesktopEnvironment } from "@/lib/desktop/client";

export function EmergencySessionRecovery() {
  useEffect(() => {
    if (!isDesktopEnvironment()) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        event.stopImmediatePropagation();
        console.info("[logout] Ctrl+Shift+L emergency session clear triggered");
        void forceLocalSignOut("keyboard-shortcut");
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return null;
}
