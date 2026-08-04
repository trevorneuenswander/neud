"use client";

import { toAuthErrorMessage } from "@/lib/auth/errors";
import {
  buildDesktopCloudSessionPayload,
  requiresDesktopMainSessionHandoff,
} from "@/lib/auth/desktop-session-handoff";
import { mapSupabaseProfileRoleToAuthCacheRole } from "@/lib/auth/supabase-role-mapping";
import { getDesktopAPI } from "@/lib/desktop/client";
import { fetchClientProfileByUserId } from "@/lib/supabase/fetch-profile";
import { createClient } from "@/lib/supabase/client";

export { forceLocalSignOut, clearLocalSessionOnly } from "@/lib/auth/force-local-sign-out";

export async function signInWithCredentials(
  email: string,
  password: string,
): Promise<void> {
  const supabase = createClient();
  const trimmedEmail = email.trim();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error) {
    throw new Error(toAuthErrorMessage(error));
  }

  const userId = data.user?.id;
  if (!userId) {
    throw new Error("Sign in failed. Check your credentials and try again.");
  }

  const { profile, error: profileError } = await fetchClientProfileByUserId(
    supabase,
    userId,
  );

  if (profileError || !profile) {
    await supabase.auth.signOut();
    throw new Error(
      "Your account is missing a profile. Contact your system administrator.",
    );
  }

  if (!requiresDesktopMainSessionHandoff()) {
    return;
  }

  const api = getDesktopAPI();
  if (!api?.auth?.storeVerifiedSession) {
    throw new Error(
      "Desktop cloud session bridge is unavailable. Restart NEUD Desktop and try again.",
    );
  }

  const cloudSession = buildDesktopCloudSessionPayload(data.session);
  const deviceId = await api.app.getHostId();

  await api.auth.storeVerifiedSession({
    handoffTarget: "desktop",
    userId,
    email: trimmedEmail,
    displayName: profile.full_name,
    team: profile.team,
    role: mapSupabaseProfileRoleToAuthCacheRole(profile.role),
    deviceId,
    cloudSession,
  });
}
