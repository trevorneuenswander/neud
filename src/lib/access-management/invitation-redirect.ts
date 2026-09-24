import "server-only";

import fs from "node:fs";
import path from "node:path";

export const ACCEPT_INVITATION_ROUTE_PATH = "/accept-invitation";
export const AUTH_CONFIRM_ROUTE_PATH = "/auth/confirm";

export type InvitationRedirectOriginSource =
  | "NEUD_TRUSTED_PORTAL_ORIGIN"
  | "VERCEL_URL"
  | "NEXT_PUBLIC_SITE_URL"
  | "request_site_origin"
  | "localhost_dev_fallback";

export type ResolvedInvitationRedirect = {
  resolvedInvitationRedirectOrigin: string;
  resolvedInvitationRedirectSource: InvitationRedirectOriginSource;
  acceptRoutePath: string;
  authConfirmPath: string;
  generatedInviteRedirectPath: string;
  generatedInviteRedirectUrl: string;
};

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function resolveInvitationRedirectOrigin(options?: {
  requestSiteOrigin?: string | null;
}): Pick<
  ResolvedInvitationRedirect,
  "resolvedInvitationRedirectOrigin" | "resolvedInvitationRedirectSource"
> {
  const trusted = process.env.NEUD_TRUSTED_PORTAL_ORIGIN?.trim();
  if (trusted) {
    const origin = normalizeOrigin(trusted);
    if (origin) {
      return {
        resolvedInvitationRedirectOrigin: origin,
        resolvedInvitationRedirectSource: "NEUD_TRUSTED_PORTAL_ORIGIN",
      };
    }
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return {
      resolvedInvitationRedirectOrigin: `https://${host}`,
      resolvedInvitationRedirectSource: "VERCEL_URL",
    };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    const origin = normalizeOrigin(siteUrl);
    if (origin) {
      return {
        resolvedInvitationRedirectOrigin: origin,
        resolvedInvitationRedirectSource: "NEXT_PUBLIC_SITE_URL",
      };
    }
  }

  const requestOrigin = options?.requestSiteOrigin?.trim();
  if (requestOrigin) {
    const origin = normalizeOrigin(requestOrigin);
    if (origin) {
      return {
        resolvedInvitationRedirectOrigin: origin,
        resolvedInvitationRedirectSource: "request_site_origin",
      };
    }
  }

  return {
    resolvedInvitationRedirectOrigin: "http://127.0.0.1:3000",
    resolvedInvitationRedirectSource: "localhost_dev_fallback",
  };
}

export function buildSupabaseInviteRedirectTo(options?: {
  requestSiteOrigin?: string | null;
}): ResolvedInvitationRedirect {
  const { resolvedInvitationRedirectOrigin, resolvedInvitationRedirectSource } =
    resolveInvitationRedirectOrigin(options);
  const generatedInviteRedirectPath = `${AUTH_CONFIRM_ROUTE_PATH}?next=${encodeURIComponent(
    ACCEPT_INVITATION_ROUTE_PATH,
  )}`;
  const generatedInviteRedirectUrl = `${resolvedInvitationRedirectOrigin}${generatedInviteRedirectPath}`;

  return {
    resolvedInvitationRedirectOrigin,
    resolvedInvitationRedirectSource,
    acceptRoutePath: ACCEPT_INVITATION_ROUTE_PATH,
    authConfirmPath: AUTH_CONFIRM_ROUTE_PATH,
    generatedInviteRedirectPath,
    generatedInviteRedirectUrl,
  };
}

export function classifyInvitationRedirectUrlCategory(
  redirectUrl: string,
): "localhost_dev" | "vercel_preview" | "production" | "unknown" {
  try {
    const host = new URL(redirectUrl).hostname.toLowerCase();
    if (host === "127.0.0.1" || host === "localhost") {
      return "localhost_dev";
    }
    if (host.endsWith(".vercel.app") || host.includes("vercel.app")) {
      return "vercel_preview";
    }
    if (host === "neud.io" || host.endsWith(".neud.io")) {
      return "production";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function acceptRouteExistsInAppTree(repoRoot: string): boolean {
  const candidates = [
    path.join(repoRoot, "src", "app", "(public)", "accept-invitation", "page.tsx"),
    path.join(repoRoot, "src", "app", "accept-invitation", "page.tsx"),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

export function authConfirmRouteExistsInAppTree(repoRoot: string): boolean {
  return fs.existsSync(path.join(repoRoot, "src", "app", "auth", "confirm", "page.tsx"));
}

export type InvitationAcceptFailureStage =
  | "redirect_origin_wrong"
  | "redirect_path_wrong"
  | "route_missing"
  | "token_param_missing"
  | "invite_id_missing"
  | "auth_callback_missing"
  | "acceptance_handler_missing"
  | "acceptance_rpc_failed"
  | "none";

export function deriveInvitationAcceptDiagnosticStage(input: {
  acceptRouteExists: boolean;
  authConfirmExists: boolean;
  redirectPath: string;
  redirectUrlCategory: string;
  resolvedSource: InvitationRedirectOriginSource;
}): InvitationAcceptFailureStage {
  if (!input.authConfirmExists) {
    return "auth_callback_missing";
  }
  if (!input.acceptRouteExists) {
    return "route_missing";
  }
  if (
    !input.redirectPath.includes("/auth/confirm") ||
    !input.redirectPath.includes("next=")
  ) {
    return "redirect_path_wrong";
  }
  if (
    input.resolvedSource === "localhost_dev_fallback" &&
    input.redirectUrlCategory === "production"
  ) {
    return "redirect_origin_wrong";
  }
  return "none";
}
