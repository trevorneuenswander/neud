import "server-only";
import { localFetch, getLocalApiSessionToken } from "@/lib/local/api";
import {
  getLocalApiSessionTokenFromFile,
} from "@/lib/local/session-config.server";
import { shouldUseLocalData } from "@/lib/local/mode";
import { normalizeApplicationRole } from "@/lib/auth/application-roles";
import type { Profile } from "@/types/database";
import type { LocalProjectsListMeta } from "@/lib/displays/types";

async function localFetchWithSession<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const token = getLocalApiSessionToken() ?? getLocalApiSessionTokenFromFile();
  if (!token) {
    return localFetch<T>(path, init);
  }

  return localFetch<T>(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "x-neud-local-session": token,
    },
  });
}

export async function resolveLocalAuthenticatedPrincipal(): Promise<{
  userId: string;
  role: string | null | undefined;
  email?: string | null;
  displayName?: string | null;
  team?: string | null;
} | null> {
  if (!shouldUseLocalData()) {
    return null;
  }

  try {
    const status = await localFetchWithSession<{
      authenticated: boolean;
      userId: string | null;
      email?: string | null;
      displayName?: string | null;
      team?: string | null;
      role?: string | null;
    }>("/api/auth/session", { timeoutMs: 1_500 });

    if (status.authenticated && status.userId) {
      return {
        userId: status.userId,
        role: status.role,
        email: status.email,
        displayName: status.displayName,
        team: status.team,
      };
    }
  } catch {
    // No authenticated desktop session available.
  }

  return null;
}

function buildLocalProfile(
  userId: string,
  meta?: Pick<
    LocalProjectsListMeta,
    | "authenticatedUserDisplayName"
    | "authenticatedUserEmail"
    | "authenticatedUserTeam"
    | "authenticatedUserRole"
    | "primaryMembershipTeamName"
  >,
  fallback?: {
    role?: string | null;
    email?: string | null;
    displayName?: string | null;
    team?: string | null;
  },
): Profile {
  const team =
    meta?.authenticatedUserTeam ??
    meta?.primaryMembershipTeamName ??
    fallback?.team ??
    null;

  return {
    id: userId,
    full_name: meta?.authenticatedUserDisplayName ?? fallback?.displayName ?? null,
    email: meta?.authenticatedUserEmail ?? fallback?.email ?? null,
    phone_number: null,
    team,
    role: normalizeApplicationRole(meta?.authenticatedUserRole ?? fallback?.role),
    created_at: "",
    updated_at: "",
  };
}

export async function resolveLocalProfile(): Promise<Profile | null> {
  if (!shouldUseLocalData()) {
    return null;
  }

  const principal = await resolveLocalAuthenticatedPrincipal();
  if (!principal) {
    return null;
  }

  try {
    const meta = await localFetchWithSession<LocalProjectsListMeta>(
      "/api/projects/meta?wait=false",
      { timeoutMs: 2_000 },
    );
    return buildLocalProfile(principal.userId, meta, principal);
  } catch {
    return buildLocalProfile(principal.userId, undefined, principal);
  }
}

export async function resolveLocalSessionProfile(): Promise<Profile | null> {
  const principal = await resolveLocalAuthenticatedPrincipal();
  if (!principal) {
    return null;
  }
  return buildLocalProfile(principal.userId, undefined, principal);
}
