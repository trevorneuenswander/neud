"use client";

import { isDesktopRuntimeClient } from "@/lib/runtime/environment";
import { SidebarDownloadLink } from "@/components/portal/SidebarDownloadLink";

export function SidebarDownloadLinkSection() {
  if (isDesktopRuntimeClient()) {
    return null;
  }

  return (
    <div className="shrink-0 px-3 pb-2">
      <SidebarDownloadLink />
    </div>
  );
}

export function shouldShowDesktopDownloadCta(): boolean {
  return !isDesktopRuntimeClient();
}
