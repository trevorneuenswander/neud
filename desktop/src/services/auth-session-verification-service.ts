import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthLicenseManager } from "./auth-license-manager";
import { fetchSupabaseProfileByUserId } from "./fetch-supabase-profile";
import { mergeOptionalProfileString } from "./resolve-authenticated-profile";

export type AuthSessionVerificationResult =
  | { status: "valid" }
  | { status: "offline" }
  | { status: "revoked"; message: string };

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  );
}

export async function verifyAuthenticatedSupabaseSession(input: {
  supabase: SupabaseClient;
  auth: AuthLicenseManager;
}): Promise<AuthSessionVerificationResult> {
  const authUser = input.auth.getAuthenticatedUser();
  if (!authUser) {
    return { status: "revoked", message: "No authenticated session." };
  }

  try {
    const { data, error } = await input.supabase.auth.getUser();
    if (error) {
      if (isNetworkError(error)) {
        return { status: "offline" };
      }
      return {
        status: "revoked",
        message: error.message || "Supabase rejected the current session.",
      };
    }

    const user = data.user;
    if (!user || user.id !== authUser.userId) {
      return {
        status: "revoked",
        message: "Supabase account no longer matches the local session.",
      };
    }

    if (user.banned_until && Date.parse(user.banned_until) > Date.now()) {
      return {
        status: "revoked",
        message: "Supabase account is disabled.",
      };
    }

    input.auth.refreshOnlineVerification();
    await syncAuthenticatedProfileFromSupabase(input);
    return { status: "valid" };
  } catch (error) {
    if (isNetworkError(error)) {
      return { status: "offline" };
    }
    return {
      status: "revoked",
      message: error instanceof Error ? error.message : "Unable to verify session.",
    };
  }
}

export async function probeSupabaseConnectivity(
  supabase: SupabaseClient,
): Promise<boolean> {
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function syncAuthenticatedProfileFromSupabase(input: {
  supabase: SupabaseClient;
  auth: AuthLicenseManager;
}): Promise<void> {
  const authUser = input.auth.getAuthenticatedUser();
  if (!authUser) {
    return;
  }

  const profileResult = await fetchSupabaseProfileByUserId(
    input.supabase,
    authUser.userId,
  );

  if (profileResult.status === "error" || profileResult.status === "missing") {
    return;
  }

  if (profileResult.profile.id !== authUser.userId) {
    return;
  }

  input.auth.updateCachedProfile({
    displayName: mergeOptionalProfileString(
      authUser.displayName,
      profileResult.profile.full_name,
    ),
    team: mergeOptionalProfileString(authUser.team, profileResult.profile.team),
  });
}
