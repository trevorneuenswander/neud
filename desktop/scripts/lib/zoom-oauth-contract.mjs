/** Pure Zoom OAuth contract helpers for regression tests (mirrors desktop TS). */

export function getZoomOAuthRedirectUri(input) {
  if (input.mode === "production") {
    return "https://neud.io/oauth/zoom/callback";
  }
  if (input.loopbackPort == null) {
    throw new Error("Development Zoom OAuth requires an ephemeral loopback port.");
  }
  return `http://127.0.0.1:${input.loopbackPort}/oauth/zoom/callback`;
}

export function parseZoomOAuthDeepLink(url) {
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const protocol = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (protocol !== "neud") return { ok: false, reason: "invalid_scheme" };
  const host = parsed.hostname.toLowerCase();
  const pathName = parsed.pathname.replace(/\/+$/, "") || "/";
  if (host !== "oauth" || pathName !== "/zoom/callback") {
    return { ok: false, reason: "invalid_host_path" };
  }
  return {
    ok: true,
    code: parsed.searchParams.get("code"),
    state: parsed.searchParams.get("state"),
    error: parsed.searchParams.get("error"),
    errorDescription: parsed.searchParams.get("error_description"),
  };
}
