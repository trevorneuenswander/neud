"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AppTitleBar } from "@/components/portal/AppTitleBar";
import { EmergencySessionRecovery } from "@/components/auth/EmergencySessionRecovery";
import { OutputCleanMode } from "@/components/displays/OutputCleanMode";
import { NeudAppDialogHost } from "@/components/portal/NeudAppDialogHost";
import { PerformanceStatusBar } from "@/components/portal/PerformanceStatusBar";
import { UpdateAvailableModalHost } from "@/components/settings/UpdateAvailableModal";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import {
  showDesktopTitleBarShell,
  showInWindowApplicationMenu,
} from "@/lib/desktop/shell-capabilities";
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

function isGraphicEditorRoute(pathname: string | null) {
  return Boolean(pathname?.startsWith("/editor"));
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

function useDesktopPlatform(): string | null {
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopEnvironment()) {
      return;
    }
    void getDesktopAPI()?.app?.getPlatform?.().then((value) => {
      const resolved = value ?? "win32";
      setPlatform(resolved);
      document.documentElement.dataset.platform = resolved;
    });
  }, []);

  return platform;
}

export function DesktopAppShell({ children, initialRuntime }: DesktopAppShellProps) {
  const runtime = useShellRuntime(initialRuntime);
  const desktopActive = useDesktopShellActive(runtime);
  const platform = useDesktopPlatform();
  const showTitleBarShell = showDesktopTitleBarShell(platform, desktopActive);
  const showInWindowMenu =
    desktopActive && platform != null && showInWindowApplicationMenu(platform);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const outputRoute =
    isDisplayOutputRoute(pathname, searchParams.get("mode"), searchParams.get("preview")) ||
    isHostedFullscreenViewerPath(pathname ?? "");
  const editorRoute = isGraphicEditorRoute(pathname);

  if (outputRoute || editorRoute) {
    return (
      <>
        <OutputCleanMode />
        {children}
      </>
    );
  }

  const showPerfBar = desktopActive;

  return (
    <div
      className="relative h-dvh overflow-hidden bg-background text-foreground"
      data-desktop-shell={desktopActive ? "true" : "false"}
      data-runtime={runtime}
    >
      <OutputCleanMode />
      <EmergencySessionRecovery />
      {showTitleBarShell ? <AppTitleBar active /> : null}
      <div
        id="neud-app-content"
        className="app-body content-viewport absolute inset-x-0 flex flex-col overflow-hidden"
        style={{
          top: showTitleBarShell ? "var(--window-menu-height, 0px)" : 0,
          bottom: showPerfBar ? "var(--neud-perf-bar-height, 0px)" : 0,
        }}
      >
        {children}
      </div>
      {showPerfBar ? <PerformanceStatusBar /> : null}
      <NeudAppDialogHost />
      <UpdateAvailableModalHost />
      <div
        id="neud-overlay-root"
        className="overlay-root data-[desktop-shell=false]:top-0"
        data-desktop-shell={desktopActive ? "true" : "false"}
        aria-hidden={false}
      />
    </div>
  );
}
