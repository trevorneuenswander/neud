/** Internal auth/cloud bundle types used by dashboard and local API — not the footer internet indicator. */

export type ConnectivityTone = "success" | "muted" | "warning" | "destructive";

export type DesktopAuthStatusBundle = {
  auth: {
    mode: "locked" | "offline" | "online";
    allowed: boolean;
    message: string;
  };
  connectionStatus: "connected" | "offline";
  cloudConfigured?: boolean;
  hasCloudSession?: boolean;
  userDirectorySync?: {
    syncInProgress?: boolean;
    syncStartedAt?: string | null;
    connectionOnline?: boolean;
    message?: string;
    lastSuccessfulSyncAt?: string | null;
  };
};
