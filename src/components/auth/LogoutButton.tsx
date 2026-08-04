"use client";

import { useState } from "react";
import { forceLocalSignOut } from "@/lib/auth/force-local-sign-out";

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  function handleClick() {
    console.info("[logout] Sign Out clicked");
    setPending(true);
    void forceLocalSignOut("sidebar-sign-out").finally(() => {
      setPending(false);
    });
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
