export type UserDirectorySyncStatus =
  | "success"
  | "partial"
  | "offline"
  | "failed"
  | "syncing"
  | "idle";

export type UserDirectorySyncState = {
  status: UserDirectorySyncStatus;
  message: string;
  lastSuccessfulSyncAt: string | null;
  syncInProgress: boolean;
  connectionOnline: boolean;
};

export type AuthStatus = {
  mode: "locked" | "offline" | "online";
  allowed: boolean;
  email: string | null;
  role: string | null;
  offlineExpiresAt: string | null;
  lastVerifiedAt: string | null;
  requiresOnlineVerification: boolean;
  message: string;
  offlineAccessRemainingMs: number | null;
  offlineAccessWarning: boolean;
};
