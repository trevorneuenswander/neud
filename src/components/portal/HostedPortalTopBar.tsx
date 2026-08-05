"use client";

import { WindowsDownloadLink } from "@/components/downloads/WindowsDownloadLink";
import { usePathname } from "next/navigation";
import { isHostedViewerPath } from "@/lib/routing/hosted-routes";

export function HostedPortalTopBar() {
  const pathname = usePathname();

  if (isHostedViewerPath(pathname ?? "")) {
    return null;
  }

  return (
    <div className="mb-4 flex items-center justify-end gap-3 text-sm">
      <WindowsDownloadLink className="text-muted transition-colors hover:text-foreground">
        Download Desktop
      </WindowsDownloadLink>
    </div>
  );
}
