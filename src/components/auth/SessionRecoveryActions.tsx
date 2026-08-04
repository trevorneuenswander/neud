"use client";

import { useState } from "react";
import { forceLocalSignOut } from "@/lib/auth/force-local-sign-out";

type SessionRecoveryActionsProps = {
  compact?: boolean;
  onRetry?: () => void;
  retryPending?: boolean;
  showClearLocalSession?: boolean;
};

export function SessionRecoveryActions({
  compact = false,
  onRetry,
  retryPending = false,
  showClearLocalSession = false,
}: SessionRecoveryActionsProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [clearingSession, setClearingSession] = useState(false);

  function handleSignOut() {
    console.info("[logout] Sign Out clicked");
    setSigningOut(true);
    void forceLocalSignOut("recovery-sign-out").finally(() => {
      setSigningOut(false);
    });
  }

  function handleClearLocalSession() {
    console.info("[logout] Clear Local Session clicked");
    setClearingSession(true);
    void forceLocalSignOut("clear-local-session").finally(() => {
      setClearingSession(false);
    });
  }

  const buttonClass = compact
    ? "cursor-pointer text-sm font-medium text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70"
    : "inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-70";

  return (
    <div
      className="space-y-2"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <div className={`flex flex-wrap gap-2 ${compact ? "flex-col items-start" : ""}`}>
        {onRetry ? (
          <button
            type="button"
            disabled={retryPending || signingOut || clearingSession}
            onClick={() => onRetry()}
            className={buttonClass}
          >
            {retryPending ? "Retrying…" : "Retry"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={signingOut || clearingSession}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleSignOut();
          }}
          className={buttonClass}
        >
          {signingOut ? "Signing out…" : "Sign Out"}
        </button>
        {showClearLocalSession ? (
          <button
            type="button"
            disabled={signingOut || clearingSession}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleClearLocalSession();
            }}
            className={buttonClass}
          >
            {clearingSession ? "Clearing session…" : "Clear Local Session and Sign In Again"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
