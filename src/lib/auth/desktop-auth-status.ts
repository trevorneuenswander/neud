import type { AuthStatus, UserDirectorySyncState } from "@/lib/auth/user-directory-sync";

export type { AuthStatus, UserDirectorySyncState };

export type DesktopAuthStatusResponse = {
  auth: AuthStatus;
  connectionStatus: "connected" | "offline";
  cloudConfigured?: boolean;
  hasCloudSession?: boolean;
  authenticatedCloudSessionAvailable?: boolean;
  requiresCloudReauthentication?: boolean;
  sharedAuthSnapshot?: Record<string, unknown> | null;
  profileIndicatorState?: "online" | "offline" | "sign_in";
  dashboardConnectionState?: "connected" | "offline" | "sign_in";
  localSessionValid?: boolean;
  networkReachable?: boolean;
  userDirectorySync: UserDirectorySyncState;
};
