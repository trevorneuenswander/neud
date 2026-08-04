import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type VerifiedDesktopAdminRequest =
  | {
      ok: true;
      userId: string;
      role: string;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

export async function verifyDesktopAdminRequest(
  request: Request,
): Promise<VerifiedDesktopAdminRequest> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  let userId: string | null = null;

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
      return {
        ok: false,
        status: 401,
        code: "authentication_required",
        message: "Sign in required.",
      };
    }
    userId = data.user.id;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return {
        ok: false,
        status: 401,
        code: "authentication_required",
        message: "Sign in required.",
      };
    }
    userId = user.id;
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "Profile not found.",
    };
  }

  if (profile.role !== "owner" && profile.role !== "admin") {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "You do not have permission to perform this action.",
    };
  }

  return {
    ok: true,
    userId,
    role: profile.role,
  };
}
