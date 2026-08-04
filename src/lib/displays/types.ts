export type ProjectDisplay = {
  id: string;
  project_id: string;
  name: string;
  display_key: string;
  display_type: string;
  url: string;
  width: number | null;
  height: number | null;
  background: string | null;
  enabled: boolean;
  refresh_rate_ms: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LocalProjectsListMeta = {
  databasePath: string;
  projectCount: number;
  mode: "local";
  authenticatedUserId: string | null;
  authenticatedLocalUserId?: string | null;
  authenticatedUserEmail?: string | null;
  authenticatedUserDisplayName?: string | null;
  authenticatedUserTeam?: string | null;
  authenticatedUserRole?: string | null;
  identityStatus?:
    | "loading-session"
    | "loading-profile"
    | "ready"
    | "offline-ready"
    | "missing-profile"
    | "stale-session"
    | "identity-conflict"
    | "error";
  identityRetryCount?: number;
  identityDiagnostics?: {
    authSessionPresent: boolean;
    supabaseUserValidation: string;
    profileQueryStatus: string;
    lastIdentityError: string | null;
    retryCount: number;
    supabaseProfileResolved?: boolean;
    localCacheSyncStatus?: string;
    identityAttemptId?: number | null;
    identityAttemptDurationMs?: number | null;
    loadingPromiseActive?: boolean;
  };
  resolvedProfileSource?:
    | "remote-cache"
    | "local-user"
    | "team-membership"
    | "merged"
    | "supabase"
    | "none";
  primaryMembershipTeamName?: string | null;
  identityMessage?: string | null;
  localCacheSyncStatus?: "idle" | "pending" | "synced" | "error";
  localCacheSyncErrorCode?: string | null;
  conflictingLocalUserId?: string | null;
  isPlatformAdmin?: boolean;
  canCreateProject?: boolean;
  canDeleteProject?: boolean;
  canManageUsersAndAccess?: boolean;
  authorizationContext?: unknown;
  defaultProjectSlug?: string | null;
  filteringApplied: boolean;
};
