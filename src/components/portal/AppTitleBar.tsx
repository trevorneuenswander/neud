"use client";

import { useEffect, useRef, useState } from "react";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import { showInWindowApplicationMenu } from "@/lib/desktop/shell-capabilities";

type AppTitleBarProps = {
  /** When false, render a same-size placeholder to preserve layout during SSR/hydration. */
  active?: boolean;
};

export function AppTitleBar({ active = true }: AppTitleBarProps) {
  const [menuLabels, setMenuLabels] = useState<string[]>([]);
  const [platform, setPlatform] = useState<string>("win32");
  const [isMaximized, setIsMaximized] = useState(false);
  const titleBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return;

    const api = getDesktopAPI()?.app;
    if (!api?.getMenuLabels) return;

    void Promise.all([
      api.getMenuLabels(),
      api.getPlatform(),
      api.getWindowState?.() ?? Promise.resolve({ isMaximized: false }),
    ]).then(([labels, nextPlatform, windowState]) => {
      setMenuLabels(labels ?? []);
      const resolvedPlatform = nextPlatform ?? "win32";
      setPlatform(resolvedPlatform);
      document.documentElement.dataset.platform = resolvedPlatform;
      setIsMaximized(windowState?.isMaximized ?? false);
    });
  }, [active]);

  const inWindowMenuEnabled = showInWindowApplicationMenu(platform);

  useEffect(() => {
    if (!active) return;

    const titleBar = titleBarRef.current;
    if (!titleBar) return;

    const syncTitleBarHeight = () => {
      const height = Math.ceil(titleBar.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--title-bar-height", `${height}px`);
      document.documentElement.style.setProperty("--window-menu-height", `${height}px`);
      document.documentElement.style.setProperty("--desktop-titlebar-height", `${height}px`);
    };

    syncTitleBarHeight();
    const observer = new ResizeObserver(syncTitleBarHeight);
    observer.observe(titleBar);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--title-bar-height");
      document.documentElement.style.removeProperty("--window-menu-height");
    };
  }, [active]);

  const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;
  const dragStyle = { WebkitAppRegion: "drag" } as React.CSSProperties;

  if (!active) {
    return (
      <div
        className="fixed left-0 right-0 top-0 z-[1001] h-9 border-b border-transparent"
        aria-hidden="true"
      />
    );
  }

  const popupMenu = (label: string, event: React.MouseEvent<HTMLButtonElement>) => {
    const api = getDesktopAPI()?.app;
    if (!api?.popupMenu) return;
    const rect = event.currentTarget.getBoundingClientRect();
    void api.popupMenu(label, {
      x: Math.round(rect.left),
      y: Math.round(rect.bottom),
    });
  };

  const windowControl = (action: "minimize" | "maximize" | "close") => {
    const api = getDesktopAPI()?.app;
    if (!api?.windowControl) return;
    void api.windowControl(action).then((state) => {
      if (state) {
        setIsMaximized(state.isMaximized);
      }
    });
  };

  const showWindowControls = platform !== "darwin";

  return (
    <div
      ref={titleBarRef}
      className="fixed left-0 right-0 top-0 z-[1001] flex h-9 items-center border-b border-border bg-background pl-3 pr-0"
      style={dragStyle}
    >
      {inWindowMenuEnabled ? (
        <nav
          className="flex items-center gap-1"
          aria-label="Application menu"
          style={noDragStyle}
        >
          {menuLabels.map((label) => (
            <button
              key={label}
              type="button"
              className="rounded px-2 py-1 text-sm text-foreground hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={(event) => popupMenu(label, event)}
            >
              {label}
            </button>
          ))}
        </nav>
      ) : (
        <div className="min-w-0 flex-1" aria-hidden="true" />
      )}
      {showWindowControls ? (
        <div className="ml-auto flex h-full items-stretch" style={noDragStyle}>
          <button
            type="button"
            aria-label="Minimize"
            className="inline-flex w-11 items-center justify-center text-sm text-foreground hover:bg-surface-raised"
            onClick={() => windowControl("minimize")}
          >
            &#8211;
          </button>
          <button
            type="button"
            aria-label={isMaximized ? "Restore" : "Maximize"}
            className="inline-flex w-11 items-center justify-center text-sm text-foreground hover:bg-surface-raised"
            onClick={() => windowControl("maximize")}
          >
            {isMaximized ? "❐" : "□"}
          </button>
          <button
            type="button"
            aria-label="Close"
            className="inline-flex w-11 items-center justify-center text-sm text-foreground hover:bg-danger hover:text-white"
            onClick={() => windowControl("close")}
          >
            &#10005;
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function useDesktopShellActive(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isDesktopEnvironment());
  }, []);

  return active;
}
