"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SidebarNavItemProps = {
  href: string;
  label: string;
  onNavigate?: () => void;
};

export function SidebarNavItem({
  href,
  label,
  onNavigate,
}: SidebarNavItemProps) {
  const pathname = usePathname();
  const isActive =
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={`flex h-10 cursor-pointer items-center rounded-md px-3 text-sm font-medium transition-colors ${
        isActive
          ? "bg-primary/15 text-foreground"
          : "text-muted hover:bg-surface-raised hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}
