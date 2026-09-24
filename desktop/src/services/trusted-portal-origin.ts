import { readNeudEnv } from "../env/neud-env";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export type TrustedPortalOriginCategory =
  | "localhost_dev"
  | "vercel_preview"
  | "production"
  | "unknown";

export function classifyTrustedPortalOriginCategory(origin: string): TrustedPortalOriginCategory {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (LOCAL_HOSTS.has(host)) {
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

export function trustedPortalOriginHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export type TrustedPortalOriginResolution =
  | { ok: true; origin: string }
  | { ok: false; code: string; message: string };

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function resolveTrustedPortalOrigin(options?: {
  allowLocalDevFallback?: boolean;
  localDevFallbackOrigin?: string;
}): TrustedPortalOriginResolution {
  const configured = readNeudEnv("NEUD_TRUSTED_PORTAL_ORIGIN");
  if (configured) {
    const origin = normalizeOrigin(configured);
    if (!origin) {
      return {
        ok: false,
        code: "invalid_trusted_portal_origin",
        message: "NEUD_TRUSTED_PORTAL_ORIGIN must be a valid http(s) origin.",
      };
    }
    if (
      options?.allowLocalDevFallback &&
      classifyTrustedPortalOriginCategory(origin) === "production"
    ) {
      // Local dev should talk to the local Next server unless Preview is configured explicitly.
    } else {
      return { ok: true, origin };
    }
  }

  if (options?.allowLocalDevFallback) {
    const fallback = normalizeOrigin(
      options.localDevFallbackOrigin ?? "http://127.0.0.1:3000",
    );
    if (fallback) {
      const host = new URL(fallback).hostname;
      if (LOCAL_HOSTS.has(host)) {
        return { ok: true, origin: fallback };
      }
    }
  }

  return {
    ok: false,
    code: "trusted_portal_origin_missing",
    message: "Hosted portal URL is not configured.",
  };
}
