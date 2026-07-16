import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  type ConfirmSearchParams,
  getConfirmParamDiagnostics,
  getConfirmRedirectPath,
  getConfirmationErrorRedirect,
  getSupabaseErrorDetails,
  isEmailOtpType,
  isInviteDestination,
  isRecoveryDestination,
  logAuthConfirmDev,
  logConfirmationError,
} from "@/lib/auth/confirm-shared";
import { setFlowSessionCookie } from "@/lib/auth/confirm";

export type ConfirmPageResult = {
  kind: "client-hash";
  next: string;
};

export async function handleAuthConfirm(
  params: ConfirmSearchParams,
): Promise<ConfirmPageResult> {
  logAuthConfirmDev("request-params", getConfirmParamDiagnostics(params));

  if (params.error || params.error_code) {
    const context = isInviteDestination(params.next)
      ? "invite"
      : isRecoveryDestination(params.next)
        ? "recovery"
        : "confirmation";

    logAuthConfirmDev("supabase-error-redirect", {
      resolvedFlowType: context,
      errorCode: params.error_code ?? null,
      errorDescription: params.error_description ? "present" : null,
      redirect: getConfirmationErrorRedirect(context),
    });

    redirect(getConfirmationErrorRedirect(context));
  }

  const tokenHash = params.token_hash;
  const type = params.type;
  const code = params.code;
  const next = params.next ?? null;

  if (tokenHash) {
    if (!type || !isEmailOtpType(type)) {
      logAuthConfirmDev("token-hash-invalid-type", {
        type: type ?? null,
        method: "verifyOtp",
        redirect: getConfirmationErrorRedirect(
          isInviteDestination(next) ? "invite" : "confirmation",
        ),
      });
      redirect(
        getConfirmationErrorRedirect(
          isInviteDestination(next) ? "invite" : "confirmation",
        ),
      );
    }

    await verifyOtpAndComplete(type, tokenHash, next);
  }

  if (code) {
    if (isInviteDestination(next)) {
      logAuthConfirmDev("invite-code-flow-rejected", {
        method: "exchangeCodeForSession",
        redirect: "/login?error=invitation-invalid",
      });
      redirect("/login?error=invitation-invalid");
    }

    if (!isRecoveryDestination(next) && type !== "recovery") {
      logAuthConfirmDev("unsupported-code-flow", {
        method: "exchangeCodeForSession",
        type: type ?? null,
        next,
        redirect: "/login?error=confirmation-failed",
      });
      redirect("/login?error=confirmation-failed");
    }

    await exchangeCodeAndComplete(code, next);
  }

  if (next && (isInviteDestination(next) || isRecoveryDestination(next))) {
    const resolvedFlow = isInviteDestination(next) ? "invite" : "recovery";

    logAuthConfirmDev("client-hash-flow", {
      method: "client-hash",
      resolvedFlowType: resolvedFlow,
      next,
    });

    return {
      kind: "client-hash",
      next: isInviteDestination(next) ? "/accept-invitation" : "/update-password",
    };
  }

  logAuthConfirmDev("missing-verification-params", {
    redirect: "/login?error=confirmation-failed",
  });
  redirect("/login?error=confirmation-failed");
}

async function verifyOtpAndComplete(
  type: EmailOtpType,
  tokenHash: string,
  next: string | null,
) {
  const cookieStore = await cookies();

  logAuthConfirmDev("verification-method", {
    method: "verifyOtp",
    resolvedFlowType: type,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
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

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    logConfirmationError(error);
    const details = getSupabaseErrorDetails(error);
    const context =
      type === "invite"
        ? "invite"
        : type === "recovery"
          ? "recovery"
          : "confirmation";

    logAuthConfirmDev("verification-failed", {
      method: "verifyOtp",
      resolvedFlowType: type,
      errorCode: details.code,
      errorMessage: details.message,
      redirect: getConfirmationErrorRedirect(context),
    });

    redirect(getConfirmationErrorRedirect(context));
  }

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    logAuthConfirmDev("verification-failed", {
      method: "verifyOtp",
      resolvedFlowType: type,
      errorCode: "missing-session",
      errorMessage: claimsError?.message ?? "Session not established",
      redirect: getConfirmationErrorRedirect(
        type === "invite" ? "invite" : "confirmation",
      ),
    });
    redirect(
      getConfirmationErrorRedirect(
        type === "invite" ? "invite" : "confirmation",
      ),
    );
  }

  logAuthConfirmDev("verification-success", {
    method: "verifyOtp",
    resolvedFlowType: type,
  });

  await finalizeConfirmFlow(type, next);
}

async function exchangeCodeAndComplete(code: string, next: string | null) {
  const cookieStore = await cookies();

  logAuthConfirmDev("verification-method", {
    method: "exchangeCodeForSession",
    resolvedFlowType: "recovery",
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logConfirmationError(error);
    const details = getSupabaseErrorDetails(error);

    logAuthConfirmDev("verification-failed", {
      method: "exchangeCodeForSession",
      resolvedFlowType: "recovery",
      errorCode: details.code,
      errorMessage: details.message,
      redirect: "/login?error=confirmation-failed",
    });

    redirect("/login?error=confirmation-failed");
  }

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    logAuthConfirmDev("verification-failed", {
      method: "exchangeCodeForSession",
      resolvedFlowType: "recovery",
      errorCode: "missing-session",
      errorMessage: claimsError?.message ?? "Session not established",
      redirect: "/login?error=confirmation-failed",
    });
    redirect("/login?error=confirmation-failed");
  }

  logAuthConfirmDev("verification-success", {
    method: "exchangeCodeForSession",
    resolvedFlowType: "recovery",
  });

  await finalizeConfirmFlow("recovery", next);
}

async function finalizeConfirmFlow(
  confirmType: EmailOtpType,
  next: string | null,
) {
  const redirectPath = getConfirmRedirectPath(confirmType, next);

  if (confirmType === "invite" || confirmType === "recovery") {
    await setFlowSessionCookie(confirmType);
  }

  logAuthConfirmDev("redirect", {
    destination: redirectPath,
    resolvedFlowType: confirmType,
  });

  redirect(redirectPath);
}
