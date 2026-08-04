import {
  DEFAULT_LOCAL_API_ORIGIN,
  resolveLocalApiOriginFromCandidates,
} from "@/lib/local/normalize-local-api-origin";

export function readNeudEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function readNeudEnvFlag(name: string): boolean {
  return readNeudEnv(name) === "1";
}

export function shouldUseLocalData(): boolean {
  return readNeudEnvFlag("NEUD_USE_LOCAL_DATA");
}

export function shouldUseLocalDataClient(): boolean {
  if (typeof window !== "undefined") {
    try {
      const desktop = window.neudDesktop?.app;
      if (desktop?.isDesktop() === true) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return readNeudEnvFlag("NEXT_PUBLIC_NEUD_USE_LOCAL_DATA");
}

export function getLocalApiBaseUrl(): string {
  return resolveLocalApiOriginFromCandidates([
    readNeudEnv("NEUD_LOCAL_API_URL"),
    readNeudEnv("NEXT_PUBLIC_NEUD_LOCAL_API_URL"),
  ]);
}

export { DEFAULT_LOCAL_API_ORIGIN };

export function getTrustedPortalOrigin(): string | null {
  const configured =
    readNeudEnv("NEXT_PUBLIC_NEUD_TRUSTED_PORTAL_ORIGIN") ??
    readNeudEnv("NEUD_TRUSTED_PORTAL_ORIGIN");

  if (!configured) {
    return null;
  }

  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
