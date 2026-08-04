"use client";

import { useEffect, useState } from "react";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import { getBuildAppVersionLabel, getDisplayVersion } from "@/lib/version/app-version";

export function useAppVersion(): string {
  const [label, setLabel] = useState(() => getBuildAppVersionLabel());

  useEffect(() => {
    if (!isDesktopEnvironment()) {
      return;
    }

    const desktop = getDesktopAPI();
    if (!desktop?.app.getVersion) {
      return;
    }

    void desktop.app
      .getVersion()
      .then((version) => {
        const nextLabel = getDisplayVersion(version);
        if (nextLabel) {
          setLabel(nextLabel);
        }
      })
      .catch(() => {
        // Keep the build-time release label when the desktop bridge is unavailable.
      });
  }, []);

  return label;
}
