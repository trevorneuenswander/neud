"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import { isValidSupabasePublishableKey } from "@/lib/supabase/public-config-validation";

let cachedDesktopClient: SupabaseClient | null = null;
let cachedDesktopClientKey: string | null = null;

function createBrowserClientFromEnv(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase public configuration is missing from the application build.");
  }
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}

export async function getSupabaseBrowserClient(): Promise<SupabaseClient> {
  if (isDesktopEnvironment()) {
    const api = getDesktopAPI();
    const runtimeConfig = await api?.app?.getSupabasePublicConfig?.();
    const supabaseUrl = runtimeConfig?.supabaseUrl?.trim();
    const supabasePublishableKey = runtimeConfig?.supabasePublishableKey?.trim();
    if (
      supabaseUrl &&
      supabasePublishableKey &&
      isValidSupabasePublishableKey(supabasePublishableKey)
    ) {
      if (
        cachedDesktopClient &&
        cachedDesktopClientKey === `${supabaseUrl}|${supabasePublishableKey}`
      ) {
        return cachedDesktopClient;
      }
      cachedDesktopClient = createBrowserClient(supabaseUrl, supabasePublishableKey);
      cachedDesktopClientKey = `${supabaseUrl}|${supabasePublishableKey}`;
      return cachedDesktopClient;
    }
  }

  return createBrowserClientFromEnv();
}

/** @deprecated Prefer getSupabaseBrowserClient in desktop and auth flows. */
export function createClient(): SupabaseClient {
  return createBrowserClientFromEnv();
}
