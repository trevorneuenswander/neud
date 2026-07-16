import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  getConfirmRedirectPath,
  INVITE_SESSION_COOKIE,
  isEmailOtpType,
  logConfirmationError,
  RECOVERY_SESSION_COOKIE,
} from "@/lib/auth/confirm";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

type PendingCookie = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  const redirectWithError = (error?: unknown) => {
    logConfirmationError(error);
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "confirmation-failed");
    return NextResponse.redirect(loginUrl);
  };

  if (!tokenHash && !code) {
    return redirectWithError("Missing token_hash and code");
  }

  const pendingCookies: PendingCookie[] = [];
  let confirmType: EmailOtpType | null = null;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            pendingCookies.push({ name, value, options });
          });
          void headers;
        },
      },
    },
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirectWithError(error);
    }

    confirmType = type && isEmailOtpType(type) ? type : "email";
  } else if (tokenHash && type && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      return redirectWithError(error);
    }

    confirmType = type;
  } else {
    return redirectWithError(
      `Invalid confirmation parameters. type=${type ?? "missing"}`,
    );
  }

  const redirectPath = getConfirmRedirectPath(confirmType, next);
  const redirectResponse = NextResponse.redirect(
    new URL(getSafeRedirectPath(redirectPath), origin),
  );

  pendingCookies.forEach(({ name, value, options }) => {
    redirectResponse.cookies.set(name, value, options);
  });

  if (confirmType === "recovery") {
    redirectResponse.cookies.set(RECOVERY_SESSION_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 15,
      path: "/",
    });
  }

  if (confirmType === "invite") {
    redirectResponse.cookies.set(INVITE_SESSION_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 15,
      path: "/",
    });
  }

  return redirectResponse;
}
