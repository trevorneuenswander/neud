"use client";

import { SessionRecoveryActions } from "@/components/auth/SessionRecoveryActions";
import { localGetProjectsMeta } from "@/lib/local/displays-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { CHECKING_PROJECT_ACCESS_MESSAGE } from "@/lib/projects/project-access-copy";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type ProjectAccessStatePanelProps = {
  slug: string;
  state: "loading" | "identity-error";
  message?: string;
};

const IDENTITY_POLL_INTERVAL_MS = 500;
const IDENTITY_POLL_TIMEOUT_MS = 30_000;

function isIdentityStillLoading(
  status: string | undefined,
): boolean {
  return status === "loading-session" || status === "loading-profile";
}

export function ProjectAccessStatePanel({
  slug: _slug,
  state,
  message,
}: ProjectAccessStatePanelProps) {
  const router = useRouter();
  const [retryPending, setRetryPending] = useState(false);
  const refreshRequestedRef = useRef(false);

  useEffect(() => {
    if (state !== "loading" || !shouldUseLocalDataClient()) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    const pollIdentity = async () => {
      while (!cancelled && !refreshRequestedRef.current) {
        if (Date.now() - startedAt > IDENTITY_POLL_TIMEOUT_MS) {
          return;
        }

        try {
          const meta = await localGetProjectsMeta({ wait: false });
          if (!isIdentityStillLoading(meta.identityStatus)) {
            refreshRequestedRef.current = true;
            router.refresh();
            return;
          }
        } catch {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, IDENTITY_POLL_INTERVAL_MS));
      }
    };

    void pollIdentity();

    return () => {
      cancelled = true;
    };
  }, [router, state]);

  async function handleRetry() {
    setRetryPending(true);
    try {
      const { localRetryIdentitySync } = await import("@/lib/local/displays-api");
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
