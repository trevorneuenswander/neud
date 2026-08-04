import { localFetch } from "@/lib/local/api";
import type { DesktopAuthStatusResponse } from "@/lib/auth/desktop-auth-status";

export async function localGetAuthStatus() {
  return localFetch<DesktopAuthStatusResponse>("/api/auth/status");
}

export async function localVerifyOnlineSession() {
  return localFetch<DesktopAuthStatusResponse>("/api/auth/verify-online", {
    method: "POST",
  });
}

export async function localSyncUserDirectory() {
  return localFetch<DesktopAuthStatusResponse>("/api/access/sync-users", {
    method: "POST",
  });
}
