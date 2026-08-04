"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageSection } from "@/components/portal/PageSection";
import type { DesktopAuthStatusResponse } from "@/lib/auth/desktop-auth-status";
import { localGetAuthStatus, localVerifyOnlineSession } from "@/lib/local/auth-api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not available";
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "Not available";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatRemainingDuration(remainingMs: number | null): string {
  if (remainingMs === null || remainingMs <= 0) {
    return "Expired";
  }
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  if (days > 0) {
    return `${days} day${days === 1 ? "" : "s"}, ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const minutes = totalMinutes % 60;
  return `${hours} hour${hours === 1 ? "" : "s"}, ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function authenticationLabel(mode: DesktopAuthStatusResponse["auth"]["mode"]): string {
  if (mode === "online") {
    return "Online Authenticated";
  }
  if (mode === "offline") {
    return "Offline Authenticated";
  }
  return "Authentication Required";
}

export function DashboardAuthenticationStatus() {
  const [status, setStatus] = useState<DesktopAuthStatusResponse | null>(null);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) {
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        const next = await localGetAuthStatus();
        if (!cancelled) {
          setStatus(next);
        }
      } catch {
        if (!cancelled) {
          setStatus(null);
        }
      }
    };

    void refresh();
    void localVerifyOnlineSession().then(refresh).catch(() => undefined);

    const interval = window.setInterval(() => {
      void refresh();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const rows = useMemo(() => {
    if (!status) {
      return null;
    }

    const auth = status.auth;
    const sync = status.userDirectorySync;
    const isOnline = auth.mode === "online";
    const isOfflineAuthenticated = auth.mode === "offline";

    return [
      {
        label: "Account Authentication Status",
        value: authenticationLabel(auth.mode),
      },
      {
        label: "Connection Status",
        value: status.connectionStatus === "connected" ? "Connected" : "Offline",
      },
      {
        label: "Last Online Authentication",
        value: formatDateTime(auth.lastVerifiedAt),
      },
      {
        label: isOnline ? "Offline Access" : "Offline Access Remaining",
        value: isOnline
          ? `Available until ${formatDateTime(auth.offlineExpiresAt)}`
          : formatRemainingDuration(auth.offlineAccessRemainingMs),
      },
      {
        label: "User Directory Sync",
        value: sync.message,
      },
      {
        label: "Last User Sync",
        value: formatDateTime(sync.lastSuccessfulSyncAt),
      },
    ];
  }, [status]);

  if (!shouldUseLocalDataClient()) {
    return null;
  }

  return (
    <PageSection title="Account Authentication Status">
      <Card className="space-y-4">
        {!rows ? (
          <p className="text-sm text-muted">Loading authentication status…</p>
        ) : (
          <>
            {status?.auth.offlineAccessWarning && status.auth.mode === "offline" ? (
              <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                Reconnect to the internet within{" "}
                {formatRemainingDuration(status.auth.offlineAccessRemainingMs)} to keep using NEUD.
              </p>
            ) : null}
            <dl className="grid gap-3 sm:grid-cols-2">
              {rows.map((row) => (
                <div key={row.label}>
                  <dt className="text-sm font-medium text-muted">{row.label}</dt>
                  <dd className="mt-1 text-sm text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </Card>
    </PageSection>
  );
}
