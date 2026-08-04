"use client";

import Link from "next/link";
import { AppVersion } from "@/components/branding/AppVersion";
import { APP_NAME } from "@/lib/branding/app-name";

export function SidebarBranding() {
  return (
    <Link
      href="/dashboard"
      className="sidebar-brand flex min-w-0 items-baseline justify-between gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="sidebar-brand-name shrink-0 text-sm font-semibold uppercase tracking-[0.28em] text-foreground">
        {APP_NAME}
      </span>
      <AppVersion placement="sidebar" />
    </Link>
  );
}
