"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SessionRecoveryActions } from "@/components/auth/SessionRecoveryActions";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { localGetProjectsMeta, localRetryIdentitySync } from "@/lib/local/displays-api";
import { useConnectivityPresentation } from "@/lib/connectivity/use-internet-connection";
import { shouldRunDesktopConnectivityProbe } from "@/lib/connectivity/should-run-desktop-connectivity-probe";
import { connectivityToneClassName } from "@/lib/connectivity/connectivity-presentation";
import { formatPlatformRole } from "@/lib/portal/navigation";
import { resolveSidebarTeamName } from "@/lib/profile/resolve-profile-team";
import { getUserDetailsHref } from "@/lib/routes/activity-navigation";
import type { LocalProjectsListMeta } from "@/lib/displays/types";
import type { Profile } from "@/types/database";

type SidebarUserPanelProps = {
  profile: Profile;
  profileHref?: string;
};

type IdentityUiStatus = "loading" | "ready" | "error";

function applyMetaToProfile(
  current: Profile,
  meta: LocalProjectsListMeta,
): Profile {
  return {
    ...current,
    full_name: meta.authenticatedUserDisplayName ?? current.full_name,
    team: meta.authenticatedUserTeam ?? current.team,
    role: (meta.authenticatedUserRole ?? current.role) as Profile["role"],
  };
}

function resolveIdentityUiStatus(meta: LocalProjectsListMeta | null): IdentityUiStatus {
  if (!meta) {
    return "loading";
  }
  if (
    meta.identityStatus === "loading-session" ||
    meta.identityStatus === "loading-profile"
  ) {
    return "loading";
  }
  if (
    meta.identityStatus === "ready" ||
    meta.identityStatus === "offline-ready"
  ) {
    return "ready";
  }
  return "error";
}

function isIdentityRecoverable(meta: LocalProjectsListMeta | null): boolean {
  return (
    meta?.identityStatus === "error" ||
    meta?.identityStatus === "missing-profile" ||
    meta?.identityStatus === "stale-session" ||
    meta?.identityStatus === "identity-conflict"
  );
}

export function SidebarUserPanel({
  profile: initialProfile,
  profileHref,
}: SidebarUserPanelProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [identityStatus, setIdentityStatus] = useState<IdentityUiStatus>(
    shouldUseLocalDataClient() &&
      (!initialProfile.full_name?.trim() || !initialProfile.team?.trim())
      ? "loading"
      : "ready",
  );
  const [meta, setMeta] = useState<LocalProjectsListMeta | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const [showConnectivityIndicator, setShowConnectivityIndicator] = useState(false);
  const connectivity = useConnectivityPresentation();

  useEffect(() => {
    setShowConnectivityIndicator(shouldRunDesktopConnectivityProbe());
  }, []);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) {
      return;
    }

    let cancelled = false;

    const refreshProfileFromMeta = async () => {
      try {
        const nextMeta = await localGetProjectsMeta({ wait: false });
        if (cancelled) {
          return;
        }

        setMeta(nextMeta);
        setIdentityStatus(resolveIdentityUiStatus(nextMeta));
        setProfile((current) => applyMetaToProfile(current, nextMeta));
        setIdentityMessage(
          resolveIdentityUiStatus(nextMeta) === "error"
            ? nextMeta.identityMessage ?? null
            : null,
        );
      } catch {
        if (!cancelled) {
          setIdentityStatus("error");
        }
      }
    };

    void refreshProfileFromMeta();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshProfileFromMeta();
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshProfileFromMeta();
    }, 5_000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refreshProfileFromMeta);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refreshProfileFromMeta);
    };
  }, []);

  async function handleRetry() {
    setRetryPending(true);
    try {
      const result = await localRetryIdentitySync();
      const nextMeta = result.meta;
      setMeta(nextMeta);
      setIdentityStatus(resolveIdentityUiStatus(nextMeta));
      setProfile((current) => applyMetaToProfile(current, nextMeta));
      setIdentityMessage(
        resolveIdentityUiStatus(nextMeta) === "error"
          ? nextMeta.identityMessage ?? null
          : null,
      );
    } finally {
      setRetryPending(false);
    }
  }

  const displayName =
    identityStatus === "loading"
      ? "Loading account…"
      : identityStatus === "error"
        ? "Account could not be loaded"
        : profile.full_name?.trim() || "Name not set";
  const teamName =
    identityStatus === "loading"
      ? "Loading account…"
      : identityStatus === "error"
        ? ""
        : resolveSidebarTeamName(profile);
  const roleLabel =
    identityStatus === "ready" ? formatPlatformRole(profile.role) : null;
  const pathname = usePathname();
  const profileActive = profileHref ? pathname === profileHref : false;
  const userDetailsHref =
    profileHref ??
    (meta?.authenticatedLocalUserId?.trim() || initialProfile.id
      ? getUserDetailsHref(meta?.authenticatedLocalUserId?.trim() || initialProfile.id)
      : null);

  const panelStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

  const identityContent = (
    <>
      <p className="sidebar-user-name truncate text-sm font-medium text-foreground">{displayName}</p>
      {teamName ? (
        <p
          className="sidebar-user-team truncate text-xs text-muted opacity-70"
          title={teamName}
        >
          {teamName}
        </p>
      ) : null}
      {roleLabel ? (
        <p className="sidebar-user-role truncate text-xs text-muted opacity-70">{roleLabel}</p>
      ) : null}
      {identityStatus === "ready" && showConnectivityIndicator ? (
        <p
          className={`sidebar-user-connection truncate text-xs ${connectivityToneClassName(connectivity.tone)}`}
          title={connectivity.detail}
        >
          {connectivity.label}
        </p>
      ) : null}
      {identityStatus === "error" && identityMessage ? (
        <p className="mt-2 text-xs text-amber-400/90">{identityMessage}</p>
      ) : null}
    </>
  );

  return (
    <div className="space-y-3" style={panelStyle}>
      <div className="sidebar-user-identity min-w-0">
        {identityStatus === "ready" && userDetailsHref ? (
          <Link
            href={userDetailsHref}
            aria-current={profileActive ? "page" : undefined}
            className={`block rounded-md px-2 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              profileActive
                ? "bg-primary/15"
                : "hover:bg-surface-raised"
            }`}
          >
            {identityContent}
          </Link>
        ) : (
          identityContent
        )}
      </div>
      {identityStatus === "error" ? (
        <SessionRecoveryActions
          compact
          showClearLocalSession={meta?.identityStatus === "stale-session"}
          onRetry={isIdentityRecoverable(meta) ? () => void handleRetry() : undefined}
          retryPending={retryPending}
        />
      ) : (
        <LogoutButton />
      )}
    </div>
  );
}
