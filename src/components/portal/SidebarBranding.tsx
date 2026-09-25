"use client";

import Link from "next/link";
import { AppVersion } from "@/components/branding/AppVersion";
import { SidebarTooltip } from "@/components/portal/SidebarTooltip";
import { APP_NAME } from "@/lib/branding/app-name";
import { useSidebarCollapsed } from "@/lib/portal/sidebar-collapse-context";
import { SidebarPanelLeftIcon } from "@/lib/portal/sidebar-nav-icons";
import {
  SIDEBAR_COLLAPSED_CENTER_ROW_CLASS,
  SIDEBAR_PRIMARY_NAV_CHEVRON_CLASS,
} from "@/lib/portal/sidebar-nav-item-classes";

type SidebarBrandingProps = {
  onToggleSidebar?: () => void;
};

const brandMarkClass =
  "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-surface-raised text-xs font-bold uppercase tracking-wide text-foreground";

const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

function CollapsedSidebarOpenControl({ onOpen }: { onOpen: () => void }) {
  return (
    <SidebarTooltip label="Open sidebar">
      <div className={SIDEBAR_COLLAPSED_CENTER_ROW_CLASS} style={noDragStyle}>
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open sidebar"
          aria-expanded={false}
          className={`${brandMarkClass} group cursor-pointer transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
        >
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"
          >
            N
          </span>
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <SidebarPanelLeftIcon className="h-5 w-5" />
          </span>
        </button>
      </div>
    </SidebarTooltip>
  );
}

function ExpandedSidebarCloseControl({ onClose }: { onClose: () => void }) {
  return (
    <SidebarTooltip label="Close sidebar">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close sidebar"
        aria-expanded
        className={`${SIDEBAR_PRIMARY_NAV_CHEVRON_CLASS} shrink-0`}
        style={noDragStyle}
      >
        <SidebarPanelLeftIcon className="h-5 w-5" />
      </button>
    </SidebarTooltip>
  );
}

export function SidebarBranding({ onToggleSidebar }: SidebarBrandingProps) {
  const collapsed = useSidebarCollapsed();

  if (collapsed && onToggleSidebar) {
    return <CollapsedSidebarOpenControl onOpen={onToggleSidebar} />;
  }

  if (collapsed) {
    return (
      <div className={SIDEBAR_COLLAPSED_CENTER_ROW_CLASS} style={noDragStyle}>
        <Link
          href="/dashboard"
          aria-label={APP_NAME}
          className={`${brandMarkClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
        >
          N
        </Link>
      </div>
    );
  }

  return (
    <div className="sidebar-brand flex w-full min-w-0 items-center gap-1" style={noDragStyle}>
      <Link
        href="/dashboard"
        className="flex min-w-0 flex-1 items-baseline gap-2 truncate rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="sidebar-brand-name shrink-0 text-sm font-semibold uppercase tracking-[0.28em] text-foreground">
          {APP_NAME}
        </span>
        <AppVersion placement="sidebar" />
      </Link>
      {onToggleSidebar ? (
        <ExpandedSidebarCloseControl onClose={onToggleSidebar} />
      ) : null}
    </div>
  );
}
