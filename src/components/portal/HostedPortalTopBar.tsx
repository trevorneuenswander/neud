"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HOSTED_PORTAL_PATHS, isHostedViewerPath } from "@/lib/routing/hosted-routes";

export function HostedPortalTopBar() {
  const pathname = usePathname();

  if (isHostedViewerPath(pathname ?? "")) {
    return null;
  }

  return (
    <div className="mb-4 flex items-center justify-end gap-3 text-sm">
      <Link
        href={HOSTED_PORTAL_PATHS.download}
        className="text-muted transition-colors hover:text-foreground"
      >
        Download Desktop
      </Link>
    </div>
  );
}
