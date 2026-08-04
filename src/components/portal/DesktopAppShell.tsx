"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AppTitleBar } from "@/components/portal/AppTitleBar";
import { EmergencySessionRecovery } from "@/components/auth/EmergencySessionRecovery";
import { NeudAppDialogHost } from "@/components/portal/NeudAppDialogHost";
import { isDesktopEnvironment } from "@/lib/desktop/client";
import { resolveDisplayViewMode } from "@/lib/displays/display-view-mode";
import { isHostedFullscreenViewerPath } from "@/lib/routing/hosted-routes";

type DesktopAppShellProps = {
  children: ReactNode;
  initialRuntime: "desktop" | "hosted";
};

function isDisplayOutputRoute(pathname: string | null, mode: string | null, preview: string | null) {
  if (!pathname?.startsWith("/display/")) {
    return false;
  }
  return resolveDisplayViewMode({ preview, mode }) === "output";
}

function useShellRuntime(initialRuntime: "desktop" | "hosted"): "desktop" | "hosted" {
  const [runtime, setRuntime] = useState(initialRuntime);

  useEffect(() => {
    setRuntime(document.documentElement.dataset.runtime === "desktop" ? "desktop" : "hosted");
  }, []);

  return runtime;
}

function useDesktopShellActive(runtime: "desktop" | "hosted"): boolean {
  const [electronActive, setElectronActive] = useState(false);

  useEffect(() => {
    setElectronActive(isDesktopEnvironment());
  }, []);

  return runtime === "desktop" && electronActive;
}

export function DesktopAppShell({ children, initialRuntime }: DesktopAppShellProps) {
  const runtime = useShellRuntime(initialRuntime);
  const desktopActive = useDesktopShellActive(runtime);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const outputRoute =
    isDisplayOutputRoute(pathname, searchParams.get("mode"), searchParams.get("preview")) ||
    isHostedFullscreenViewerPath(pathname ?? "");

  if (outputRoute) {
    return <>{children}</>;
  }

  return (
    <div
      className="relative h-dvh overflow-hidden bg-background text-foreground"
      data-desktop-shell={desktopActive ? "true" : "false"}
      data-runtime={runtime}
    >
      <EmergencySessionRecovery />
      {desktopActive ? <AppTitleBar active /> : null}
      <div
        id="neud-app-content"
        className="app-body content-viewport absolute inset-x-0 bottom-0 flex flex-col overflow-hidden"
        style={{ top: desktopActive ? "var(--window-menu-height, 0px)" : 0 }}
      >
        {children}
      </div>
      <NeudAppDialogHost />
      <div
        id="neud-overlay-root"
        className="overlay-root data-[desktop-shell=false]:top-0"
        data-desktop-shell={desktopActive ? "true" : "false"}
        aria-hidden={false}
      />
    </div>
  );
}
