"use client";

import { useEffect, type ReactNode } from "react";

type HostedFullscreenOutputShellProps = {
  active: boolean;
  children: ReactNode;
};

export function HostedFullscreenOutputShell({
  active,
  children,
}: HostedFullscreenOutputShellProps) {
  useEffect(() => {
    if (!active) {
      return;
    }

    document.documentElement.classList.add("neud-fullscreen-output");
    document.body.classList.add("neud-fullscreen-output");

    return () => {
      document.documentElement.classList.remove("neud-fullscreen-output");
      document.body.classList.remove("neud-fullscreen-output");
    };
  }, [active]);

  return <>{children}</>;
}
