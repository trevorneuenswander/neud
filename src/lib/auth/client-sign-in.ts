"use client";

import { toAuthErrorMessage } from "@/lib/auth/errors";
import {
  buildDesktopCloudSessionPayload,
  requiresDesktopMainSessionHandoff,
} from "@/lib/auth/desktop-session-handoff";
import { mapSupabaseProfileRoleToAuthCacheRole } from "@/lib/auth/supabase-role-mapping";
import { getDesktopAPI } from "@/lib/desktop/client";
import { fetchClientProfileByUserId } from "@/lib/supabase/fetch-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { describeSupabasePublishableKey } from "@/lib/supabase/public-config-validation";

export { forceLocalSignOut, clearLocalSessionOnly } from "@/lib/auth/force-local-sign-out";

async function recordAuthLoginDiagnostic(
  stage: string,
  detail: Record<string, unknown>,
): Promise<void> {
  if (!requiresDesktopMainSessionHandoff()) {
    return;
  }
  const api = getDesktopAPI();
  await api?.app?.recordAuthLoginDiagnostic?.({ stage, ...detail });
}

export async function signInWithCredentials(
  email: string,
  password: string,
): Promise<void> {
  const trimmedEmail = email.trim();
  let supabase;
  let authUrlHost: string | null = null;
  try {
    if (requiresDesktopMainSessionHandoff()) {
      const runtimeConfig = await getDesktopAPI()?.app?.getSupabasePublicConfig?.();
      authUrlHost = runtimeConfig?.diagnostic?.urlHost ?? null;
      await recordAuthLoginDiagnostic("auth.config.resolved", {
        source: runtimeConfig?.diagnostic?.source ?? "unknown",
        urlHost: authUrlHost,
        keyPresent: runtimeConfig?.diagnostic?.keyPresent ?? false,
        key: describeSupabasePublishableKey(runtimeConfig?.supabasePublishableKey ?? null),
      });
    }
    supabase = await getSupabaseBrowserClient();
  } catch (configError) {
    await recordAuthLoginDiagnostic("auth.config.failed", {
      message: configError instanceof Error ? configError.message : String(configError),
    });
    throw configError;
  }

  await recordAuthLoginDiagnostic("auth.supabase.sign_in.request", {
    urlHost: authUrlHost,
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error) {
    await recordAuthLoginDiagnostic("auth.supabase.sign_in.failed", {
      urlHost: authUrlHost,
      status: typeof error.status === "number" ? error.status : null,
      code: typeof error.code === "string" ? error.code : null,
      message: error.message,
    });
    throw new Error(toAuthErrorMessage(error));
  }

  await recordAuthLoginDiagnostic("auth.supabase.sign_in.succeeded", {
    urlHost: authUrlHost,
  });

  const userId = data.user?.id;
  if (!userId) {
    throw new Error("Sign in failed. Check your credentials and try again.");
  }

  const { profile, error: profileError } = await fetchClientProfileByUserId(
    supabase,
    userId,
  );

  if (profileError || !profile) {
    await recordAuthLoginDiagnostic("auth.profile.missing", {
      message: profileError ?? "profile_not_found",
    });
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
    await recordAuthLoginDiagnostic("auth.session_handoff.bridge_missing", {});
    throw new Error(
      "Desktop cloud session bridge is unavailable. Restart NEUD Desktop and try again.",
    );
  }

  const cloudSession = buildDesktopCloudSessionPayload(data.session);
  const deviceId = await api.app.getHostId();

  await recordAuthLoginDiagnostic("auth.session_handoff.store.request", {
    userId,
  });

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

  await recordAuthLoginDiagnostic("auth.session_handoff.store.succeeded", {
    userId,
  });
}
