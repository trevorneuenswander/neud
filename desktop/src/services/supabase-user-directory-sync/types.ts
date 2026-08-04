export const USER_DIRECTORY_SYNC_LAST_SUCCESS_KEY = "neud.userDirectorySync.lastSuccess";
export const USER_DIRECTORY_SYNC_LAST_RESULT_KEY = "neud.userDirectorySync.lastResult";

export const USER_DIRECTORY_SYNC_INTERVAL_MS = 15 * 60 * 1000;
export const USER_DIRECTORY_SYNC_STALE_MS = 5 * 60 * 1000;
export const USER_DIRECTORY_SYNC_MAX_IN_FLIGHT_MS = 120_000;
export const USER_DIRECTORY_SYNC_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;

export type UserDirectorySyncStatus =
  | "success"
  | "partial"
  | "offline"
  | "failed"
  | "syncing"
  | "idle";

export type UserDirectorySyncError = {
  userId?: string;
  message: string;
};

export type UserDirectorySyncResult = {
  status: "success" | "partial" | "offline" | "failed";
  startedAt: string;
  completedAt?: string;
  usersFetched: number;
  usersCreated: number;
  usersUpdated: number;
  usersLinked: number;
  usersUnchanged: number;
  usersMarkedUnavailable: number;
  errors: UserDirectorySyncError[];
};

export type UserDirectorySyncState = {
  status: UserDirectorySyncStatus;
  message: string;
  lastSuccessfulSyncAt: string | null;
  lastResult: UserDirectorySyncResult | null;
  syncInProgress: boolean;
  syncStartedAt: string | null;
  connectionOnline: boolean;
};
