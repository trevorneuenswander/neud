const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function classifyTrustedPortalOriginCategory(origin) {
  if (!origin) {
    return "unknown";
  }
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

export function resolveTrustedPortalOriginForDiagnose(env) {
  const configured = env.NEUD_TRUSTED_PORTAL_ORIGIN?.trim();
  if (configured) {
    try {
      return { origin: new URL(configured).origin.replace(/\/$/, ""), source: "configured" };
    } catch {
      return { origin: null, source: "invalid" };
    }
  }
  return { origin: "http://127.0.0.1:3000", source: "dev_fallback_assumed" };
}
