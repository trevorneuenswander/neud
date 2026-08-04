"use client";

import { useEffect, useState } from "react";
import { UserDetailsLoadingState, UserDetailsState, UserDetailsView } from "@/components/users/UserDetailsView";
import { localGetUserDetails } from "@/lib/local/access-api";
import { isLocalApiError } from "@/lib/local/errors";
import type { UserDetailsProfile } from "@/lib/users/user-details-types";

type UserDetailsClientProps = {
  userId: string;
  backHref?: string;
};

export function UserDetailsClient({ userId, backHref }: UserDetailsClientProps) {
  const [profile, setProfile] = useState<UserDetailsProfile | null>(null);
  const [errorState, setErrorState] = useState<{
    title: string;
    description: string;
    variant: "error" | "info";
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setErrorState(null);

    void localGetUserDetails(userId)
      .then((result) => {
        if (cancelled) return;
        setProfile({
          id: result.user.id,
          fullName: result.user.fullName,
          email: result.user.email,
          phone: result.user.phone,
          teamName: result.user.teamName,
          roleLabel: result.user.roleLabel,
          platformRole: result.user.platformRole,
          source: result.user.source,
          isActive: result.user.isActive,
          supabaseUserId: result.user.supabaseUserId ?? null,
          supabaseAccountAvailable: result.user.supabaseAccountAvailable ?? true,
          lastSupabaseSyncAt: result.user.lastSupabaseSyncAt ?? null,
          teams: result.teams,
          projects: result.projects,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isLocalApiError(error)) {
          if (error.status === 404) {
            setErrorState({
              title: "User not found",
              description: "This user record is no longer available.",
              variant: "info",
            });
            return;
          }
          if (error.status === 403) {
            setErrorState({
              title: "Permission denied",
              description: "You do not have permission to view this user's details.",
              variant: "error",
            });
            return;
          }
        }
        setErrorState({
          title: "Unable to load user details",
          description:
            error instanceof Error ? error.message : "A database or network error occurred.",
          variant: "error",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (errorState) {
    return (
      <UserDetailsState
        title={errorState.title}
        description={errorState.description}
        variant={errorState.variant}
      />
    );
  }

  if (!profile) {
    return <UserDetailsLoadingState />;
  }

  return <UserDetailsView profile={profile} backHref={backHref} />;
}
