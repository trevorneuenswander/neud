/** Keep probe URLs aligned with `src/lib/connectivity/internet-connectivity.ts`. */
const INTERNET_REACHABILITY_PROBE_URLS = [
  "https://www.msftconnecttest.com/connecttest.txt",
  "https://connectivitycheck.gstatic.com/generate_204",
] as const;

const DEFAULT_TIMEOUT_MS = 4_000;

async function probeUrl(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok || response.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeInternetReachability(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  for (const url of INTERNET_REACHABILITY_PROBE_URLS) {
    if (await probeUrl(url, timeoutMs)) {
      return true;
    }
  }
  return false;
}
