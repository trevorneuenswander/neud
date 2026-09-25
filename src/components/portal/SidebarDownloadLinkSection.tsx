"use client";

import { isDesktopRuntimeClient } from "@/lib/runtime/environment";
import { SidebarDownloadLink } from "@/components/portal/SidebarDownloadLink";
import { useSidebarCollapsed } from "@/lib/portal/sidebar-collapse-context";

export function SidebarDownloadLinkSection() {
  const collapsed = useSidebarCollapsed();

  if (isDesktopRuntimeClient() || collapsed) {
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
