import { shouldUseLocalDataClient } from "@/lib/local/mode";

export type AccessInviteRuntime = "hosted-web" | "desktop-local";

export type AccessInviteDiagnosticContext = {
  runtime: AccessInviteRuntime;
  online: boolean;
  authenticated: boolean | null;
  apiPath: "hosted-api" | "desktop-trusted-api" | "desktop-local-api";
};

export function resolveAccessInviteRuntime(): AccessInviteRuntime {
  return shouldUseLocalDataClient() ? "desktop-local" : "hosted-web";
}

export function resolveAccessInviteApiPath(
  runtime: AccessInviteRuntime,
): AccessInviteDiagnosticContext["apiPath"] {
  return runtime === "hosted-web" ? "hosted-api" : "desktop-trusted-api";
}

export function buildAccessInviteDiagnosticContext(input: {
  authenticated?: boolean | null;
} = {}): AccessInviteDiagnosticContext {
  const runtime = resolveAccessInviteRuntime();
  return {
    runtime,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    authenticated: input.authenticated ?? null,
    apiPath: resolveAccessInviteApiPath(runtime),
  };
}

export function logAccessInviteFailure(
  stage: string,
  context: AccessInviteDiagnosticContext,
  details: Record<string, unknown> = {},
) {
  console.warn("[access-invite]", {
    stage,
    runtime: context.runtime,
    online: context.online,
    authenticated: context.authenticated,
    apiPath: context.apiPath,
    ...details,
  });
}
