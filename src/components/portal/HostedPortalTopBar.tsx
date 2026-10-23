"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isHostedViewerPath } from "@/lib/routing/hosted-routes";

export function HostedPortalTopBar() {
  const pathname = usePathname();

  if (isHostedViewerPath(pathname ?? "")) {
    return null;
  }

  return (
    <div className="mb-4 flex items-center justify-end gap-3 text-sm">
      <Link
        href="/download"
        className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Get NEUD
      </Link>
    </div>
  );
}
