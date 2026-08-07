import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function parseCookieHeader(cookieHeader: string | null): Array<{ name: string; value: string }> {
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0) {
        return null;
      }
      return {
        name: part.slice(0, separatorIndex).trim(),
        value: part.slice(separatorIndex + 1).trim(),
      };
    })
    .filter((entry): entry is { name: string; value: string } => entry !== null);
}

function mergeCookieSources(
  requestCookies: Array<{ name: string; value: string }>,
  storeCookies: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
  const merged = new Map<string, string>();
  for (const cookie of storeCookies) {
    merged.set(cookie.name, cookie.value);
  }
  for (const cookie of requestCookies) {
    merged.set(cookie.name, cookie.value);
  }
  return Array.from(merged.entries()).map(([name, value]) => ({ name, value }));
}

/** Route-handler Supabase client that reads auth cookies from the incoming request. */
export async function createClientFromRequest(request: Request) {
  const cookieStore = await cookies();
  const requestCookies = parseCookieHeader(request.headers.get("cookie"));

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return mergeCookieSources(requestCookies, cookieStore.getAll());
        },
        setAll(cookiesToSet, headers) {
          void headers;
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Route handlers may not always be able to set cookies here.
          }
        },
      },
    },
  );
}

export function requestHasSupabaseAuthCookies(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") ?? "";
  return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(cookieHeader);
}
