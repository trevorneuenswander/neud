"use client";

import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/with-timeout";

const REMOTE_SIGN_OUT_TIMEOUT_MS = 3_000;
const IPC_FORCE_SIGN_OUT_TIMEOUT_MS = 4_000;

function logLogoutStep(message: string) {
  console.info(`[logout] ${message}`);
}

async function resetNextSessionCache(): Promise<void> {
  try {
    await fetch("/api/local/reset-session-cache", {
      method: "POST",
      cache: "no-store",
    });
    logLogoutStep("Next.js session cache reset");
  } catch (error) {
    console.warn("[logout] Next.js session cache reset failed", error);
  }
}

function redirectToLoginHard() {
  logLogoutStep("Redirecting to login");
  window.location.replace("/");
}

function fireAndForgetRemoteSignOut() {
  logLogoutStep("Supabase signOut started");
  const supabase = createClient();
  void withTimeout(
    supabase.auth.signOut(),
    REMOTE_SIGN_OUT_TIMEOUT_MS,
    "Remote sign-out timed out",
  )
    .then(() => {
      logLogoutStep("Supabase signOut completed");
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Remote sign-out failed";
      if (message.includes("timed out")) {
        logLogoutStep("Supabase signOut timed out");
      } else {
        logLogoutStep("Supabase signOut failed");
      }
      console.warn("[logout] Remote Supabase sign-out failed", { message });
    });
}

export async function forceLocalSignOut(reason = "sign-out"): Promise<void> {
  logLogoutStep("Sign Out clicked");
  logLogoutStep(`Logout handler entered (${reason})`);

  void resetNextSessionCache();
  fireAndForgetRemoteSignOut();

  const api = getDesktopAPI();
  if (isDesktopEnvironment() && api?.auth?.forceSignOut) {
    try {
      logLogoutStep("Invoking main process forceSignOut");
      await withTimeout(
        api.auth.forceSignOut(),
        IPC_FORCE_SIGN_OUT_TIMEOUT_MS,
        "Main process force sign-out timed out",
      );
      logLogoutStep("Main process forceSignOut completed");
      return;
    } catch (error) {
      console.warn("[logout] Main process forceSignOut failed; using fallback cleanup", error);
    }
  }

  try {
    if (api?.auth?.clear) {
      await withTimeout(api.auth.clear(), IPC_FORCE_SIGN_OUT_TIMEOUT_MS, "Auth clear timed out");
      logLogoutStep("Local auth cache cleared");
    }
  } catch (error) {
    console.warn("[logout] Local auth cache clear failed", error);
  }

  logLogoutStep("Identity reset requested via auth cache clear");
  redirectToLoginHard();
}

export async function clearLocalSessionOnly(reason = "clear-local-session"): Promise<void> {
  return forceLocalSignOut(reason);
}
