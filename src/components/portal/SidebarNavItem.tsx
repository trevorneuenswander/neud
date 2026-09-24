"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { resolveHostedNavActiveState } from "@/lib/portal/hosted-navigation";
import {
  SIDEBAR_PRIMARY_NAV_ROW_CLASS,
  sidebarPrimaryNavActiveClass,
  sidebarPrimaryNavInactiveClass,
} from "@/lib/portal/sidebar-nav-item-classes";

type SidebarNavItemProps = {
  href: string;
  label: string;
  activeMatch?: "exact" | "prefix";
  onNavigate?: () => void;
};

function resolveNavActiveState(
  pathname: string,
  href: string,
  activeMatch?: "exact" | "prefix",
): boolean {
  if (href.startsWith("/portal")) {
    return resolveHostedNavActiveState(pathname, href);
  }

  const normalizedPath = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const mode = activeMatch ?? (href === "/dashboard" ? "exact" : "prefix");

  if (mode === "exact") {
    return normalizedPath === href;
  }

  return normalizedPath === href || normalizedPath.startsWith(`${href}/`);
}

export function SidebarNavItem({
  href,
  label,
  activeMatch,
  onNavigate,
}: SidebarNavItemProps) {
  const pathname = usePathname();
  const isActive = resolveNavActiveState(pathname, href, activeMatch);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      className={`${SIDEBAR_PRIMARY_NAV_ROW_CLASS} ${
        isActive ? sidebarPrimaryNavActiveClass : sidebarPrimaryNavInactiveClass
      }`}
    >
      {label}
    </Link>
  );
}
