import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type VerifiedAccessRequest =
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; status: number; code: string };

export async function verifyAuthenticatedAccessRequest(
  request: Request,
): Promise<VerifiedAccessRequest> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (bearerToken && supabaseUrl && publishableKey) {
    const tokenClient = createSupabaseClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await tokenClient.auth.getUser(bearerToken);
    if (error || !data.user) {
      return { ok: false, status: 401, code: "authentication_required" };
    }

    const authedClient = createSupabaseClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    return { ok: true, userId: data.user.id, supabase: authedClient as never };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, status: 401, code: "authentication_required" };
  }

  return { ok: true, userId: user.id, supabase };
}
