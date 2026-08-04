"use client";

import { MobileNavTrigger } from "@/components/portal/MobileNav";
import { isProjectWorkspacePath } from "@/lib/portal/navigation";
import { usePathname } from "next/navigation";

export function PortalMobileNavFallback() {
  const pathname = usePathname();

  if (isProjectWorkspacePath(pathname)) {
    return null;
  }

  return (
    <div className="mb-4 lg:hidden">
      <MobileNavTrigger />
    </div>
  );
}
