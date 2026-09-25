"use client";

import { useState } from "react";
import { forceLocalSignOut } from "@/lib/auth/force-local-sign-out";
import { SidebarSignOutIcon } from "@/lib/portal/sidebar-nav-icons";
import { sidebarPrimaryNavRowClass } from "@/lib/portal/sidebar-nav-item-classes";

type LogoutButtonProps = {
  iconOnly?: boolean;
};

export function LogoutButton({ iconOnly = false }: LogoutButtonProps) {
  const [pending, setPending] = useState(false);

  function handleClick() {
    console.info("[logout] Sign Out clicked");
    setPending(true);
    void forceLocalSignOut("sidebar-sign-out").finally(() => {
      setPending(false);
    });
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        disabled={pending}
        aria-label={pending ? "Signing out" : "Sign out"}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleClick();
        }}
        className={`${sidebarPrimaryNavRowClass(true)} w-full text-muted transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70`}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <SidebarSignOutIcon className="h-5 w-5 shrink-0" />
        <span className="sr-only">{pending ? "Signing out…" : "Sign Out"}</span>
      </button>
    );
  }

  return (
    <div
      className="space-y-1"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <button
        type="button"
        disabled={pending}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleClick();
        }}
        className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Signing out…" : "Sign Out"}
      </button>
    </div>
  );
}
