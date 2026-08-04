"use client";

import { useEffect, useState } from "react";
import { getTrustedPortalOrigin } from "@/lib/env/neud-env";
import { localFetch } from "@/lib/local/api";
import { isDesktopRuntimeClient } from "@/lib/runtime/environment";

type HostedPortalOriginState = {
  origin: string | null;
  loading: boolean;
  configured: boolean;
  message: string | null;
};

export function useHostedPortalOrigin(): HostedPortalOriginState {
  const [state, setState] = useState<HostedPortalOriginState>(() => {
    const configuredOrigin = getTrustedPortalOrigin();
    return {
      origin: configuredOrigin,
      loading: !configuredOrigin && isDesktopRuntimeClient(),
      configured: Boolean(configuredOrigin),
      message: configuredOrigin ? null : null,
    };
  });

  useEffect(() => {
    const configuredOrigin = getTrustedPortalOrigin();
    if (configuredOrigin) {
      setState({
        origin: configuredOrigin,
        loading: false,
        configured: true,
        message: null,
      });
      return;
    }

    if (!isDesktopRuntimeClient()) {
      setState({
        origin: null,
        loading: false,
        configured: false,
        message: null,
      });
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const payload = await localFetch<{
          origin: string | null;
          configured: boolean;
          message?: string;
        }>("/api/hosted/portal-origin", { timeoutMs: 4_000 });

        if (cancelled) {
          return;
        }

        setState({
          origin: payload.origin,
          loading: false,
          configured: payload.configured,
          message:
            payload.message ??
            (payload.configured ? null : "Hosted portal URL is not configured."),
        });
      } catch {
        if (!cancelled) {
          setState({
            origin: null,
            loading: false,
            configured: false,
            message: "Unable to resolve hosted portal origin.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
