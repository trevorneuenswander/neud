import {
  buildYouTubeAuthorizeUrl,
  createYouTubeOAuthState,
  createYouTubePkce,
  startYouTubeOAuthLoopback,
  YouTubeOAuthFlowError,
  YOUTUBE_OAUTH_TIMEOUT_MS,
  type YouTubeOAuthFailureCode,
  type YouTubeTokenSet,
} from "./youtube-oauth.ts";

export type YouTubeOAuthPhase =
  | "idle"
  | "pending"
  | "cancelled"
  | "timed_out"
  | "denied"
  | "exchange_failed"
  | "revoked";

export type YouTubeOAuthOutcome = {
  phase: Exclude<YouTubeOAuthPhase, "idle" | "pending">;
  message: string;
};

export type YouTubeOAuthSnapshot = {
  phase: YouTubeOAuthPhase;
  message: string | null;
  listenerCount: number;
};

type Loopback = Awaited<ReturnType<typeof startYouTubeOAuthLoopback>>;

/**
 * One YouTube OAuth attempt at a time.
 * The PKCE verifier lives only in the attempt closure and is dropped on
 * success, failure, cancel, timeout, or shutdown.
 */
export class YouTubeOAuthFlow {
  private readonly deps: {
    timeoutMs?: number;
    openExternal: (url: string) => Promise<void>;
    startLoopback?: typeof startYouTubeOAuthLoopback;
    exchangeCode: (input: {
      clientId: string;
      clientSecret?: string | null;
      code: string;
      codeVerifier: string;
      redirectUri: string;
    }) => Promise<YouTubeTokenSet>;
    readChannelTitle: (accessToken: string) => Promise<string | null>;
    readClient: () => { clientId: string; clientSecret?: string | null; refreshToken: string | null };
    persistSuccess: (tokens: YouTubeTokenSet, connectedAs: string | null) => void;
    persistFailure: (outcome: YouTubeOAuthOutcome) => void;
  };
  private active: { id: number; close: () => void } | null = null;
  private nextId = 0;
  private phase: YouTubeOAuthPhase = "idle";
  private message: string | null = null;
  private inflight: Promise<void> = Promise.resolve();
  private chain: Promise<void> = Promise.resolve();

  constructor(deps: {
      timeoutMs?: number;
      openExternal: (url: string) => Promise<void>;
      startLoopback?: typeof startYouTubeOAuthLoopback;
      exchangeCode: (input: {
        clientId: string;
        clientSecret?: string | null;
        code: string;
        codeVerifier: string;
        redirectUri: string;
      }) => Promise<YouTubeTokenSet>;
      readChannelTitle: (accessToken: string) => Promise<string | null>;
      readClient: () => { clientId: string; clientSecret?: string | null; refreshToken: string | null };
      persistSuccess: (tokens: YouTubeTokenSet, connectedAs: string | null) => void;
      persistFailure: (outcome: YouTubeOAuthOutcome) => void;
    }) {
    this.deps = deps;
  }

  snapshot(): YouTubeOAuthSnapshot {
    return {
      phase: this.phase,
      message: this.message,
      listenerCount: this.active ? 1 : 0,
    };
  }

  whenSettled(): Promise<void> {
    return this.inflight;
  }

  async start(): Promise<YouTubeOAuthSnapshot> {
    const run = this.chain.then(() => this.startExclusive());
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  cancel(): YouTubeOAuthSnapshot {
    if (!this.active) {
      this.phase = "cancelled";
      this.message = "YouTube authorization was cancelled.";
      return this.snapshot();
    }
    this.dropActive();
    const outcome: YouTubeOAuthOutcome = {
      phase: "cancelled",
      message: "YouTube authorization was cancelled.",
    };
    this.phase = outcome.phase;
    this.message = outcome.message;
    this.deps.persistFailure(outcome);
    return this.snapshot();
  }

  shutdown(): void {
    this.dropActive();
    this.phase = "idle";
    this.message = null;
  }

  private async startExclusive(): Promise<YouTubeOAuthSnapshot> {
    const restarted = this.dropActive();
    const client = this.deps.readClient();
    if (!client.clientId.trim()) {
      throw new Error("YouTube OAuth is not configured.");
    }
    const pkce = createYouTubePkce();
    const state = createYouTubeOAuthState();
    const openLoopback = this.deps.startLoopback ?? startYouTubeOAuthLoopback;
    const loopback = await openLoopback({
      expectedState: state,
      timeoutMs: this.deps.timeoutMs ?? YOUTUBE_OAUTH_TIMEOUT_MS,
    });
    const id = ++this.nextId;
    this.active = { id, close: () => loopback.close() };
    this.phase = "pending";
    this.message = restarted
      ? "Restarting YouTube authorization..."
      : "YouTube authorization is pending.";
    this.inflight = this.complete(
      id,
      loopback,
      pkce.verifier,
      client.clientId.trim(),
      client.clientSecret?.trim() ?? "",
    );
    const authorizeUrl = buildYouTubeAuthorizeUrl({
      clientId: client.clientId.trim(),
      redirectUri: loopback.redirectUri,
      state,
      codeChallenge: pkce.challenge,
    });
    try {
      await this.deps.openExternal(authorizeUrl);
      if (this.active?.id === id) {
        this.message = "YouTube authorization is pending.";
      }
    } catch (error) {
      if (this.active?.id === id) {
        this.dropActive();
        const outcome: YouTubeOAuthOutcome = {
          phase: "cancelled",
          message:
            error instanceof Error
              ? error.message
              : "Unable to open the browser for YouTube authorization.",
        };
        this.phase = outcome.phase;
        this.message = outcome.message;
        this.deps.persistFailure(outcome);
      }
      throw error;
    }
    return this.snapshot();
  }

  private async complete(
    id: number,
    loopback: Loopback,
    verifier: string,
    clientId: string,
    clientSecret: string,
  ): Promise<void> {
    try {
      const delivered = await loopback.result;
      try {
        const tokens = await this.deps.exchangeCode({
          clientId,
          clientSecret,
          code: delivered.code,
          codeVerifier: verifier,
          redirectUri: loopback.redirectUri,
        });
        if (this.active?.id !== id) {
          delivered.finish({ kind: "cancelled" });
          return;
        }
        const connectedAs = await this.deps.readChannelTitle(tokens.accessToken);
        if (this.active?.id !== id) {
          delivered.finish({ kind: "cancelled" });
          return;
        }
        this.deps.persistSuccess(tokens, connectedAs);
        this.active = null;
        this.phase = "idle";
        this.message = null;
        delivered.finish({ kind: "connected" });
      } catch (error) {
        if (this.active?.id !== id) {
          delivered.finish({ kind: "cancelled" });
          return;
        }
        this.active = null;
        const outcome = classifyYouTubeOAuthError(error);
        this.phase = outcome.phase;
        this.message = outcome.message;
        this.deps.persistFailure(outcome);
        delivered.finish(
          outcome.phase === "cancelled" || outcome.phase === "denied"
            ? { kind: "cancelled" }
            : { kind: "failed", message: outcome.message },
        );
      }
    } catch (error) {
      if (this.active?.id !== id) return;
      this.active = null;
      const outcome = classifyYouTubeOAuthError(error);
      this.phase = outcome.phase;
      this.message = outcome.message;
      this.deps.persistFailure(outcome);
    }
  }

  /** Close the current listener, if any. Returns true when an attempt was pending. */
  private dropActive(): boolean {
    const current = this.active;
    if (!current) return false;
    this.active = null;
    this.nextId += 1;
    current.close();
    return true;
  }
}

export function classifyYouTubeOAuthError(error: unknown): YouTubeOAuthOutcome {
  if (error instanceof YouTubeOAuthFlowError) {
    return { phase: phaseFor(error.code), message: error.message };
  }
  const message = error instanceof Error ? error.message : "YouTube token exchange failed.";
  if (/timed out/i.test(message)) {
    return { phase: "timed_out", message: "YouTube authorization timed out." };
  }
  if (/denied/i.test(message)) {
    return { phase: "denied", message: "YouTube authorization was denied." };
  }
  if (/cancelled/i.test(message)) {
    return { phase: "cancelled", message: "YouTube authorization was cancelled." };
  }
  if (/revoked|invalid_grant/i.test(message)) {
    return {
      phase: "revoked",
      message: "YouTube authorization was revoked. Connect the account again.",
    };
  }
  if (/token exchange|rejected the token/i.test(message)) {
    return { phase: "exchange_failed", message };
  }
  return {
    phase: "exchange_failed",
    message: message || "YouTube token exchange failed.",
  };
}

function phaseFor(code: YouTubeOAuthFailureCode): YouTubeOAuthOutcome["phase"] {
  if (code === "cancelled" || code === "timed_out" || code === "denied" || code === "revoked") {
    return code;
  }
  return "exchange_failed";
}
