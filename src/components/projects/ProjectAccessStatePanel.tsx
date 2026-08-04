"use client";

import { SessionRecoveryActions } from "@/components/auth/SessionRecoveryActions";
import { localRetryIdentitySync } from "@/lib/local/displays-api";
import { CHECKING_PROJECT_ACCESS_MESSAGE } from "@/lib/projects/project-access-copy";
import { useState } from "react";

type ProjectAccessStatePanelProps = {
  slug: string;
  state: "loading" | "identity-error";
  message?: string;
};

export function ProjectAccessStatePanel({
  slug: _slug,
  state,
  message,
}: ProjectAccessStatePanelProps) {
  const [retryPending, setRetryPending] = useState(false);

  async function handleRetry() {
    setRetryPending(true);
    try {
      await localRetryIdentitySync();
      window.location.reload();
    } finally {
      setRetryPending(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="rounded-lg border border-border bg-surface-raised/40 p-6 text-sm text-muted">
        {CHECKING_PROJECT_ACCESS_MESSAGE}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-raised/40 p-6">
      <p className="text-sm text-foreground">
        {message ?? "NEUD could not confirm project access for your account."}
      </p>
      <SessionRecoveryActions
        onRetry={() => void handleRetry()}
        retryPending={retryPending}
      />
    </div>
  );
}
