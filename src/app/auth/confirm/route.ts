import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getConfirmRedirectPath,
  RECOVERY_SESSION_COOKIE,
} from "@/lib/auth/confirm";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

const OTP_TYPES = new Set([
  "signup",
  "recovery",
  "email",
  "magiclink",
  "invite",
]);

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie.name, cookie.value);
  });
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  const redirectWithError = () => {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "confirmation-failed");
    return NextResponse.redirect(loginUrl);
  };

  if (!tokenHash && !code) {
    return redirectWithError();
  }

  let confirmType = type;
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
        },
      },
    },
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirectWithError();
    }
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "recovery" | "email" | "magiclink" | "invite",
      token_hash: tokenHash,
    });

    if (error) {
      return redirectWithError();
    }

    confirmType = type;
  } else {
    return redirectWithError();
  }

  const redirectPath = getConfirmRedirectPath(confirmType, next);
  const redirectResponse = NextResponse.redirect(
    new URL(getSafeRedirectPath(redirectPath), origin),
  );

  copyCookies(supabaseResponse, redirectResponse);

  if (confirmType === "recovery") {
    redirectResponse.cookies.set(RECOVERY_SESSION_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 15,
      path: "/",
    });
  }

  return redirectResponse;
}
