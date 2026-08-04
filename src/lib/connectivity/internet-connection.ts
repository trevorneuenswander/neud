import {
  INTERNET_REACHABILITY_PROBE_URLS,
  resolveInternetConnectivityPresentation,
  type InternetConnectivityPresentation,
} from "@/lib/connectivity/internet-connectivity";
import { shouldRunDesktopConnectivityProbe } from "@/lib/connectivity/should-run-desktop-connectivity-probe";

export type { InternetConnectivityPresentation };
export type ConnectivityPresentation = InternetConnectivityPresentation;

export type DesktopAuthStatusBundle = {
  auth: {
    mode: "locked" | "offline" | "online";
    allowed: boolean;
    message: string;
  };
  connectionStatus: "connected" | "offline";
  cloudConfigured?: boolean;
  hasCloudSession?: boolean;
  userDirectorySync?: {
    syncInProgress?: boolean;
    syncStartedAt?: string | null;
    connectionOnline?: boolean;
    message?: string;
    lastSuccessfulSyncAt?: string | null;
  };
};

export const INTERNET_PROBE_TIMEOUT_MS = 4_000;

let probeInFlight: Promise<InternetConnectivityPresentation> | null = null;
let lastKnownPresentation: InternetConnectivityPresentation = {
  label: "Offline",
  tone: "destructive",
};

function isSuccessfulProbeResponse(response: Response): boolean {
  return response.ok || response.status === 204;
}

async function probeExternalEndpoint(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (isSuccessfulProbeResponse(response)) {
        return true;
      }
    } catch {
      // Fall through to an opaque no-cors attempt for hosts that block CORS reads.
    }

    try {
      await fetch(url, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal,
      });
      return true;
    } catch {
      return false;
    }
  } finally {
    window.clearTimeout(timer);
  }
}

export async function probeAnyExternalInternetEndpoint(
  timeoutMs: number = INTERNET_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  for (const url of INTERNET_REACHABILITY_PROBE_URLS) {
    if (await probeExternalEndpoint(url, timeoutMs)) {
      return true;
    }
  }
  return false;
}

export async function probeInternetConnectivityPresentation(
  previous: InternetConnectivityPresentation = lastKnownPresentation,
): Promise<InternetConnectivityPresentation> {
  if (typeof window === "undefined" || !shouldRunDesktopConnectivityProbe()) {
    return previous;
  }

  if (probeInFlight) {
    return probeInFlight;
  }

  probeInFlight = (async () => {
    const browserOnline =
      typeof window === "undefined" ? true : window.navigator.onLine !== false;
    const checkedAt = new Date().toISOString();

    if (!browserOnline) {
      const next = resolveInternetConnectivityPresentation({
        browserOnline: false,
        reachabilityProbeSucceeded: false,
        checkedAt,
      });
      lastKnownPresentation = next;
      return next;
    }

    const externalReachable = await probeAnyExternalInternetEndpoint(
      INTERNET_PROBE_TIMEOUT_MS,
    );

    const next = resolveInternetConnectivityPresentation({
      browserOnline: true,
      reachabilityProbeSucceeded: externalReachable,
      checkedAt,
    });
    lastKnownPresentation = next;
    return next;
  })();

  try {
    return await probeInFlight;
  } catch {
    return previous;
  } finally {
    probeInFlight = null;
  }
}

/** @deprecated Use probeInternetConnectivityPresentation. */
export async function probeConnectivityPresentation(): Promise<InternetConnectivityPresentation> {
  return probeInternetConnectivityPresentation();
}

/** @deprecated Use probeInternetConnectivityPresentation. */
export async function probeInternetConnection(): Promise<boolean> {
  const presentation = await probeInternetConnectivityPresentation();
  return presentation.label === "Online";
}

export type InternetConnectionStatus = "checking" | "online" | "offline";

/** @deprecated Binary internet state has no checking label in the footer. */
export async function resolveInternetConnectionStatus(): Promise<InternetConnectionStatus> {
  const presentation = await probeInternetConnectivityPresentation();
  return presentation.label === "Online" ? "online" : "offline";
}
