/** Tracks live display viewer traffic (data polls / page loads). */
export type OnlineDisplaySession = {
  sessionId: string;
  projectId: string;
  displayId: string;
  connectedAt: string;
  lastHeartbeatAt: string;
};

const DEFAULT_STALE_MS = 30_000;

export class DisplayViewerSessionStore {
  private sessions = new Map<string, OnlineDisplaySession>();

  touch(input: {
    projectId: string;
    displayId: string;
    sessionId?: string;
  }): OnlineDisplaySession {
    const sessionId =
      input.sessionId ?? `${input.projectId}:${input.displayId}`;
    const existing = this.sessions.get(sessionId);
    const now = new Date().toISOString();
    const entry: OnlineDisplaySession = {
      sessionId,
      projectId: input.projectId,
      displayId: input.displayId,
      connectedAt: existing?.connectedAt ?? now,
      lastHeartbeatAt: now,
    };
    this.sessions.set(sessionId, entry);
    this.pruneStale(DEFAULT_STALE_MS * 4);
    return entry;
  }

  /** Active viewer instances (unique session keys with recent heartbeats). */
  countActiveSessions(staleMs = DEFAULT_STALE_MS): number {
    return this.listActiveSessions(staleMs).length;
  }

  /** Distinct displays with at least one active viewer session. */
  countActiveDistinctDisplays(staleMs = DEFAULT_STALE_MS): number {
    const displayIds = new Set<string>();
    for (const session of this.listActiveSessions(staleMs)) {
      displayIds.add(`${session.projectId}:${session.displayId}`);
    }
    return displayIds.size;
  }

  listActiveSessions(staleMs = DEFAULT_STALE_MS): OnlineDisplaySession[] {
    const cutoff = Date.now() - staleMs;
    return [...this.sessions.values()].filter(
      (session) => new Date(session.lastHeartbeatAt).getTime() >= cutoff,
    );
  }

  private pruneStale(staleMs: number) {
    const cutoff = Date.now() - staleMs;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (new Date(session.lastHeartbeatAt).getTime() < cutoff) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

export const DISPLAY_VIEWER_STALE_MS = DEFAULT_STALE_MS;
