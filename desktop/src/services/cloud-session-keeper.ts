/**
 * Keeps the Supabase cloud session healthy in the main process.
 *
 * Before this existed, the session was only refreshed when some other service happened to
 * need the cloud client. A transient refresh failure, a laptop wake after the access token
 * expired, or a rebuilt client left "Cloud Connection" reporting Offline while the network
 * was fine, and nothing retried it.
 *
 * Loop:
 *  - Network unreachable: report nothing here (status shows "Network Offline"), poll quickly.
 *  - Network reachable: refresh the token before it expires and rebuild the client.
 *  - Transient failure (network blip, rate limit, 5xx): retry with backoff.
 *    Status shows "Cloud Temporarily Reconnecting" until it succeeds.
 *  - Refresh token rejected: stop retrying. Status shows "Authentication Required".
 */

export type CloudSessionKeeperMaintainResult = {
  ok: boolean;
  transient: boolean;
  reauthenticationRequired: boolean;
  refreshed: boolean;
};

export type CloudSessionKeeperDeps = {
  isCloudConfigured: () => boolean;
  /** Local NEUD sign-in is valid (offline or online). */
  isSignedIn: () => boolean;
  getSessionHealth: () => { available: boolean; tokenExpired: boolean };
  refreshNetworkReachability: (force: boolean) => Promise<boolean>;
  maintainSession: (options: { refreshWithinMs: number }) => Promise<CloudSessionKeeperMaintainResult>;
  /** Runs once after the connection returns from a degraded state. */
  onRecovered: (reason: string) => Promise<void>;
  log?: (message: string) => void;
};

/** Refresh when less than this remains on the access token. */
export const CLOUD_SESSION_REFRESH_WITHIN_MS = 5 * 60_000;
export const CLOUD_SESSION_HEALTHY_INTERVAL_MS = 60_000;
export const CLOUD_SESSION_NETWORK_DOWN_INTERVAL_MS = 15_000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;

/** Delay before retry number `failureCount` (1-based): 5s, 10s, 20s, 40s, then 60s. */
export function resolveCloudSessionRetryDelayMs(failureCount: number): number {
  const exponent = Math.max(0, failureCount - 1);
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent);
}

export class CloudSessionKeeper {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = true;
  private degraded = false;
  private failureCount = 0;

  private readonly deps: CloudSessionKeeperDeps;

  constructor(deps: CloudSessionKeeperDeps) {
    this.deps = deps;
  }

  start(initialDelayMs = 20_000): void {
    this.stopped = false;
    this.schedule(initialDelayMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Check now, e.g. after the network returns or the computer wakes. */
  kick(): void {
    if (this.stopped) {
      return;
    }
    this.schedule(0);
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delayMs);
    this.timer.unref?.();
  }

  /** Exposed for tests. */
  async tick(): Promise<void> {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;
    let nextDelayMs = CLOUD_SESSION_HEALTHY_INTERVAL_MS;
    try {
      nextDelayMs = await this.runOnce();
    } catch (error) {
      this.degraded = true;
      this.failureCount += 1;
      nextDelayMs = resolveCloudSessionRetryDelayMs(this.failureCount);
      this.deps.log?.(
        `cloud-session-keeper.error ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
    this.schedule(nextDelayMs);
  }

  private async runOnce(): Promise<number> {
    if (!this.deps.isCloudConfigured() || !this.deps.isSignedIn()) {
      this.degraded = false;
      this.failureCount = 0;
      return CLOUD_SESSION_HEALTHY_INTERVAL_MS;
    }

    const reachable = await this.deps.refreshNetworkReachability(this.degraded);
    if (!reachable) {
      // Status reports Network Offline. Come back quickly; recovery runs when it returns.
      this.degraded = true;
      return CLOUD_SESSION_NETWORK_DOWN_INTERVAL_MS;
    }

    const before = this.deps.getSessionHealth();
    const wasUnhealthy = this.degraded || !before.available || before.tokenExpired;

    const result = await this.deps.maintainSession({
      refreshWithinMs: CLOUD_SESSION_REFRESH_WITHIN_MS,
    });

    if (result.ok) {
      this.failureCount = 0;
      this.degraded = false;
      if (wasUnhealthy) {
        this.deps.log?.("cloud-session-keeper.recovered");
        await this.deps.onRecovered("reconnect");
      }
      return CLOUD_SESSION_HEALTHY_INTERVAL_MS;
    }

    if (result.reauthenticationRequired) {
      // Retrying cannot help; the user must sign in again.
      this.degraded = false;
      this.failureCount = 0;
      this.deps.log?.("cloud-session-keeper.authentication_required");
      return CLOUD_SESSION_HEALTHY_INTERVAL_MS;
    }

    if (!result.transient) {
      // No cloud session to maintain (or a permanent config problem): do not spin.
      this.degraded = false;
      this.failureCount = 0;
      return CLOUD_SESSION_HEALTHY_INTERVAL_MS;
    }

    this.degraded = true;
    this.failureCount += 1;
    const delayMs = resolveCloudSessionRetryDelayMs(this.failureCount);
    this.deps.log?.(
      `cloud-session-keeper.retry failures=${this.failureCount} transient=${result.transient} delayMs=${delayMs}`,
    );
    return delayMs;
  }
}
