export type InternetConnectivityTone = "success" | "destructive" | "warning";

export type InternetConnectivityPresentation = {
  label: "Online" | "Offline" | "Sign In";
  tone: InternetConnectivityTone;
  detail?: string;
  lastCheckedAt?: string;
  browserOnline?: boolean;
  reachabilityProbeSucceeded?: boolean;
};

export const INTERNET_REACHABILITY_PROBE_URL =
  "https://www.msftconnecttest.com/connecttest.txt";

/** Independent fallback when the primary Microsoft probe is unreachable. */
export const INTERNET_REACHABILITY_FALLBACK_PROBE_URL =
  "https://connectivitycheck.gstatic.com/generate_204";

export const INTERNET_REACHABILITY_PROBE_URLS = [
  INTERNET_REACHABILITY_PROBE_URL,
  INTERNET_REACHABILITY_FALLBACK_PROBE_URL,
] as const;

export function resolveInternetConnectivityPresentation(input: {
  browserOnline: boolean;
  reachabilityProbeSucceeded: boolean;
  checkedAt?: string;
}): InternetConnectivityPresentation {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const browserLabel = input.browserOnline ? "connected" : "disconnected";
  const probeLabel = input.reachabilityProbeSucceeded ? "succeeded" : "failed";
  const checkedTime = new Date(checkedAt).toLocaleTimeString();
  const detail = `Network interface: ${browserLabel}. External probe: ${probeLabel}. Last checked ${checkedTime}.`;

  if (!input.browserOnline || !input.reachabilityProbeSucceeded) {
    return {
      label: "Offline",
      tone: "destructive",
      detail,
      lastCheckedAt: checkedAt,
      browserOnline: input.browserOnline,
      reachabilityProbeSucceeded: input.reachabilityProbeSucceeded,
    };
  }

  return {
    label: "Online",
    tone: "success",
    detail,
    lastCheckedAt: checkedAt,
    browserOnline: input.browserOnline,
    reachabilityProbeSucceeded: input.reachabilityProbeSucceeded,
  };
}
