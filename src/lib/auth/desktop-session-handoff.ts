import type { Session } from "@supabase/supabase-js";
import { isDesktopEnvironment } from "@/lib/desktop/client";
import { isDesktopRuntimeClient } from "@/lib/runtime/environment";

export type DesktopCloudSessionPayload = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export function requiresDesktopMainSessionHandoff(): boolean {
  return isDesktopRuntimeClient() || isDesktopEnvironment();
}

export function resolveSupabaseSessionExpiresAtMs(session: Session): number {
  if (typeof session.expires_at === "number" && session.expires_at > 0) {
    return session.expires_at * 1000;
  }

  if (typeof session.expires_in === "number" && session.expires_in > 0) {
    return Date.now() + session.expires_in * 1000;
  }

  return Date.now() + 3_600_000;
}

export function buildDesktopCloudSessionPayload(
  session: Session | null | undefined,
): DesktopCloudSessionPayload {
  if (!session?.access_token || !session.refresh_token) {
    throw new Error(
      "Desktop sign-in did not receive a complete Supabase cloud session. Try signing in again.",
    );
  }

  const expiresAt = resolveSupabaseSessionExpiresAtMs(session);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error(
      "Desktop sign-in received an invalid cloud session expiry. Try signing in again.",
    );
  }

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: Math.floor(expiresAt),
  };
}
