"use client";

import { useEffect, useState } from "react";
import {
  getConfirmationErrorRedirect,
  isInviteDestination,
  logAuthConfirmDev,
} from "@/lib/auth/confirm-shared";
import { completeConfirmFlow } from "@/lib/auth/confirm-actions";
import { createClient } from "@/lib/supabase/client";

type ConfirmHashClientProps = {
  next: string;
};

export function ConfirmHashClient({ next }: ConfirmHashClientProps) {
  const [message, setMessage] = useState(
    isInviteDestination(next) ? "Accepting invitation…" : "Confirming your link…",
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const supabase = createClient();
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : "";
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const hashType = hashParams.get("type");

      if (accessToken && refreshToken) {
        logAuthConfirmDev("client-hash-tokens-present", {
          method: "client-hash",
          resolvedFlowType: hashType,
          hasNext: true,
        });

        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          if (!cancelled) {
            const context = isInviteDestination(next) ? "invite" : "confirmation";
            window.location.replace(getConfirmationErrorRedirect(context));
          }
          return;
        }

        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      } else {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          if (!cancelled) {
            const context = isInviteDestination(next) ? "invite" : "confirmation";
            window.location.replace(getConfirmationErrorRedirect(context));
          }
          return;
        }

        logAuthConfirmDev("client-hash-session-present", {
          method: "client-hash",
          resolvedFlowType: hashType,
          hasNext: true,
        });
      }

      if (!cancelled) {
        setMessage("Redirecting…");
      }

      await completeConfirmFlow(next, hashType);
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [next]);

  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md items-center justify-center px-4">
      <p className="text-sm text-muted" role="status">
        {message}
      </p>
    </div>
  );
}
