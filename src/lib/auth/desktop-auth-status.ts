import type { AuthStatus, UserDirectorySyncState } from "@/lib/auth/user-directory-sync";

export type { AuthStatus, UserDirectorySyncState };

export type DesktopAuthStatusResponse = {
  auth: AuthStatus;
  connectionStatus: "connected" | "offline";
  cloudConfigured?: boolean;
  hasCloudSession?: boolean;
  requiresCloudReauthentication?: boolean;
  userDirectorySync: UserDirectorySyncState;
};
