import type {
  LiveChatMessage,
  LiveChatProvider,
  LiveChatProviderStatus,
} from "../types";
import { parseYouTubeVideoId } from "./youtube-video-id.ts";
import {
  activeBroadcastsUrl,
  classifyYouTubeHttpFailure,
  coerceYouTubeChatPage,
  interpretActiveBroadcasts,
  interpretLiveChatPage,
  interpretVideosList,
  liveChatMessagesUrl,
  normalizeYouTubeLiveChatItem,
  resolveYouTubePollDelayMs,
  videosListUrl,
  YouTubeStreamError,
  YOUTUBE_MIN_POLL_MS,
  YOUTUBE_QUOTA_RETRY_MS,
  YOUTUBE_STREAM_FAILURES_BEFORE_POLL,
  YOUTUBE_STREAM_RECOVERY_MS,
  type YouTubeLiveChatStream,
  type YouTubeLiveChatTransport,
  type YouTubeStreamResolution,
} from "./youtube-live-api.ts";

/** YouTube Live Chat — official Data API v3 only; no scraping. */
export class YouTubeLiveChatProvider implements LiveChatProvider {
  readonly id = "youtube-live" as const;
  readonly label = "YouTube Live";
  readonly connectionRequirements = [
    "YouTube OAuth (Desktop client, youtube.readonly)",
    "Live broadcast / video identity",
  ];

  private status: LiveChatProviderStatus = {
    provider: "youtube-live",
    status: "disconnected",
    label: this.label,
    detail: null,
    lastError: null,
  };
  private listeners = new Set<(message: LiveChatMessage) => void>();
  private statusListener: ((status: LiveChatProviderStatus) => void) | null = null;
  private transport: YouTubeLiveChatTransport | null = null;
  private generation = 0;
  private cancelTimer: (() => void) | null = null;
  private seen = new Set<string>();
  private pageToken: string | null = null;
  private videoId: string | null = null;
  private liveChatId: string | null = null;
  private streamTitle: string | null = null;
  private pollDelayMs = YOUTUBE_MIN_POLL_MS;
  private skipBacklog = true;
  private ingestionMode: "streaming" | "polling" = "streaming";
  private reconnectCount = 0;
  private streamFailures = 0;
  private pollingStartedAt = 0;
  private activeStream: YouTubeLiveChatStream | null = null;

  setIntegration(transport: YouTubeLiveChatTransport | null): void {
    this.transport = transport;
  }

  setStatusListener(listener: ((status: LiveChatProviderStatus) => void) | null): void {
    this.statusListener = listener;
  }

  async connect(settings: Record<string, unknown>): Promise<LiveChatProviderStatus> {
    this.stopLoop();
    const generation = ++this.generation;
    this.seen.clear();
    this.pageToken = null;
    this.skipBacklog = true;
    const rawId =
      typeof settings.videoOrBroadcastId === "string"
        ? settings.videoOrBroadcastId.trim()
        : "";
    const parsedId = rawId ? parseYouTubeVideoId(rawId) : null;
    if (parsedId && !parsedId.ok) {
      return this.setStatus({
        status: "error",
        detail: parsedId.error,
        meetingOrBroadcastId: null,
        lastError: parsedId.error,
      });
    }
    const requestedId = parsedId && parsedId.ok ? parsedId.videoId : "";

    if (!this.transport?.isConfigured()) {
      return this.setStatus({
        status: "authentication_required",
        detail: "YouTube OAuth is not configured.",
        meetingOrBroadcastId: requestedId || null,
        lastError: "Authentication Required",
      });
    }

    const token = await this.transport.getAccessToken();
    if (!token || generation !== this.generation) {
      const auth = this.transport.getAuthState();
      return this.setStatus({
        status: "authentication_required",
        detail: auth.detail,
        meetingOrBroadcastId: requestedId || null,
        lastError: auth.lastError ?? "Authentication Required",
      });
    }

    this.setStatus({
      status: "connecting",
      detail: "Connecting",
      meetingOrBroadcastId: requestedId || null,
      lastError: null,
    });

    const resolved = await this.resolveStream(requestedId, generation);
    if (generation !== this.generation) {
      return this.getStatus();
    }
    if (!resolved.ok) {
      const auth =
        resolved.code === "unauthorized" || resolved.code === "forbidden";
      return this.setStatus({
        status: auth ? "authentication_required" : "error",
        detail: resolved.detail,
        meetingOrBroadcastId: requestedId || null,
        lastError: resolved.detail,
      });
    }

    this.videoId = resolved.videoId;
    this.liveChatId = resolved.liveChatId;
    this.streamTitle = resolved.title;
    this.ingestionMode = "streaming";
    this.streamFailures = 0;
    this.reconnectCount = 0;
    this.setStatus({
      status: "connected",
      detail: resolved.title,
      meetingOrBroadcastId: resolved.videoId,
      sourceMode: "live",
      lastError: null,
    });
    void this.runIngestion(generation);
    return this.getStatus();
  }

  async disconnect(): Promise<LiveChatProviderStatus> {
    this.stopLoop();
    this.generation += 1;
    return this.setStatus({
      status: "disconnected",
      detail: null,
      lastError: null,
    });
  }

  getStatus(): LiveChatProviderStatus {
    return { ...this.status };
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      streamTitle: this.streamTitle,
      videoId: this.videoId,
      liveChatId: this.liveChatId,
      pollingIntervalMs: this.pollDelayMs,
      honorsYouTubePollingInterval: true,
      minimumPollMs: YOUTUBE_MIN_POLL_MS,
      ingestionMode: this.ingestionMode,
      reconnectCount: this.reconnectCount,
      lastMessageAt: this.status.lastMessageAt ?? null,
      lastError: this.status.lastError,
      feeding: this.streamTitle,
    };
  }

  subscribeMessages(onMessage: (message: LiveChatMessage) => void): () => void {
    this.listeners.add(onMessage);
    return () => {
      this.listeners.delete(onMessage);
    };
  }

  private async resolveStream(
    requestedId: string,
    generation: number,
  ): Promise<YouTubeStreamResolution> {
    const url = requestedId ? videosListUrl(requestedId) : activeBroadcastsUrl();
    const result = await this.authorizedGet(url, generation);
    if (!result) {
      return {
        ok: false,
        code: "unavailable",
        detail: "YouTube request failed. NEUD will retry.",
      };
    }
    if (result.status !== 200) {
      return classifyYouTubeHttpFailure(result.status, result.body);
    }
    return requestedId
      ? interpretVideosList(result.body, requestedId)
      : interpretActiveBroadcasts(result.body);
  }

  private async runIngestion(generation: number): Promise<void> {
    while (generation === this.generation) {
      if (this.shouldStream()) {
        const outcome = await this.readStream(generation);
        if (generation !== this.generation || outcome === "stopped" || outcome === "chat_ended") {
          return;
        }
        if (outcome === "auth" || outcome === "forbidden" || outcome === "quota") {
          this.reconnectCount += 1;
          if (outcome !== "forbidden") {
            const quota = outcome === "quota";
            this.setStatus({
              status: quota ? "connected" : "authentication_required",
              detail: quota
                ? this.streamTitle
                : "YouTube authorization expired or was revoked. Connect the YouTube account again.",
              lastError: quota
                ? "YouTube API quota or rate limit was reached. NEUD will retry."
                : "YouTube authorization expired or was revoked. Connect the YouTube account again.",
              meetingOrBroadcastId: this.videoId,
              sourceMode: "live",
            });
          }
          await this.delay(generation, YOUTUBE_QUOTA_RETRY_MS);
          continue;
        }
        this.reconnectCount += 1;
        this.streamFailures += 1;
        if (this.streamFailures >= YOUTUBE_STREAM_FAILURES_BEFORE_POLL) {
          this.ingestionMode = "polling";
          this.pollingStartedAt = this.now();
          this.setStatus({
            status: "connected",
            detail: this.streamTitle,
            lastError: "Reconnecting.",
            meetingOrBroadcastId: this.videoId,
            sourceMode: "live",
          });
          continue;
        }
        const backoff = Math.min(30_000, 1000 * 2 ** (this.streamFailures - 1));
        await this.delay(generation, backoff);
        continue;
      }

      const delay = await this.pollOnce(generation);
      if (generation !== this.generation || delay === "stop") return;
      if (
        this.transport?.openLiveChatStream &&
        this.now() - this.pollingStartedAt >= YOUTUBE_STREAM_RECOVERY_MS
      ) {
        this.ingestionMode = "streaming";
        this.streamFailures = 0;
        continue;
      }
      await this.delay(generation, delay);
    }
  }

  private shouldStream(): boolean {
    return Boolean(this.transport?.openLiveChatStream) && this.ingestionMode === "streaming";
  }

  private async readStream(
    generation: number,
  ): Promise<"chat_ended" | "stopped" | "auth" | "forbidden" | "quota" | "disconnected"> {
    const transport = this.transport;
    if (!transport?.openLiveChatStream || !this.liveChatId) {
      return "disconnected";
    }
    let token = await transport.getAccessToken();
    if (!token || generation !== this.generation) return "auth";
    try {
      return await this.consumeStream(generation, token);
    } catch (error) {
      if (error instanceof YouTubeStreamError && error.code === "unauthorized") {
        token = await transport.refreshAccessToken();
        if (!token || generation !== this.generation) return "auth";
        try {
          return await this.consumeStream(generation, token);
        } catch (retryError) {
          return this.classifyStreamFailure(retryError);
        }
      }
      return this.classifyStreamFailure(error);
    }
  }

  private async consumeStream(
    generation: number,
    accessToken: string,
  ): Promise<"chat_ended" | "stopped" | "disconnected"> {
    const transport = this.transport;
    if (!transport?.openLiveChatStream || !this.liveChatId || !this.videoId) {
      return "disconnected";
    }
    const skipHistory = this.pageToken == null;
    const stream = await transport.openLiveChatStream({
      liveChatId: this.liveChatId,
      pageToken: this.pageToken,
      accessToken,
    });
    this.activeStream = stream;
    this.ingestionMode = "streaming";
    let skipped = false;
    try {
      for await (const raw of stream.responses) {
        if (generation !== this.generation) return "stopped";
        if (!raw || typeof raw !== "object") {
          throw new YouTubeStreamError(
            "malformed",
            "YouTube returned a live chat response NEUD could not read.",
          );
        }
        const page = interpretLiveChatPage(coerceYouTubeChatPage(raw));
        if (page.nextPageToken) this.pageToken = page.nextPageToken;
        this.pollDelayMs = resolveYouTubePollDelayMs(page.pollingIntervalMillis);
        if (page.offline) {
          this.markChatEnded();
          return "chat_ended";
        }
        if (skipHistory && !skipped) {
          skipped = true;
          this.skipBacklog = false;
          continue;
        }
        if (this.consumeItems(page.items)) return "chat_ended";
        this.streamFailures = 0;
        this.markConnected();
      }
      return "disconnected";
    } finally {
      stream.close();
      if (this.activeStream === stream) this.activeStream = null;
    }
  }

  private classifyStreamFailure(
    error: unknown,
  ): "chat_ended" | "auth" | "forbidden" | "quota" | "disconnected" {
    if (error instanceof YouTubeStreamError) {
      if (error.code === "ended" || error.code === "disabled") {
        this.markChatEnded(error.message);
        return "chat_ended";
      }
      if (error.code === "unauthorized" || error.code === "forbidden") {
        this.setStatus({
          status: error.code === "unauthorized" ? "authentication_required" : "error",
          detail: error.message,
          lastError: error.message,
          meetingOrBroadcastId: this.videoId,
          sourceMode: "live",
        });
        return error.code === "unauthorized" ? "auth" : "forbidden";
      }
      if (error.code === "quota") return "quota";
    }
    return "disconnected";
  }

  private async pollOnce(generation: number): Promise<"stop" | number> {
    if (generation !== this.generation || !this.liveChatId || !this.videoId) {
      return "stop";
    }
    this.ingestionMode = "polling";
    const url = liveChatMessagesUrl(this.liveChatId, this.pageToken);
    let result: { status: number; body: unknown } | null = null;
    try {
      result = await this.authorizedGet(url, generation);
    } catch {
      result = null;
    }
    if (generation !== this.generation) return "stop";
    if (!result || result.status === 0) {
      this.setStatus({
        status: "error",
        detail: "YouTube request failed. NEUD will retry.",
        lastError: "YouTube request failed. NEUD will retry.",
        meetingOrBroadcastId: this.videoId,
        sourceMode: "live",
      });
      return this.pollDelayMs;
    }
    if (result.status !== 200) {
      const failure = classifyYouTubeHttpFailure(result.status, result.body);
      const auth = !failure.ok && (failure.code === "unauthorized" || failure.code === "forbidden");
      const ended = !failure.ok && (failure.code === "ended" || failure.detail.includes("has ended") || failure.detail.includes("disabled"));
      this.setStatus({
        status: auth ? "authentication_required" : ended ? "error" : "error",
        detail: failure.ok ? "YouTube request failed. NEUD will retry." : failure.detail,
        lastError: failure.ok ? "YouTube request failed. NEUD will retry." : failure.detail,
        meetingOrBroadcastId: this.videoId,
        sourceMode: "live",
      });
      if (ended) return "stop";
      if (!failure.ok && (failure.code === "quota" || failure.code === "unauthorized" || failure.code === "forbidden")) {
        return YOUTUBE_QUOTA_RETRY_MS;
      }
      return this.pollDelayMs;
    }

    const page = interpretLiveChatPage(coerceYouTubeChatPage(result.body));
    this.pollDelayMs = resolveYouTubePollDelayMs(page.pollingIntervalMillis);
    if (page.nextPageToken) this.pageToken = page.nextPageToken;
    if (page.offline) {
      this.markChatEnded();
      return "stop";
    }
    if (!this.skipBacklog) {
      if (this.consumeItems(page.items)) return "stop";
    }
    this.skipBacklog = false;
    this.markConnected();
    return this.pollDelayMs;
  }

  private consumeItems(items: ReturnType<typeof interpretLiveChatPage>["items"]): boolean {
    if (!this.videoId || !this.liveChatId) return false;
    for (const item of items) {
      const normalized = normalizeYouTubeLiveChatItem(item, {
        videoId: this.videoId,
        liveChatId: this.liveChatId,
      });
      if (normalized.kind === "chat_ended") {
        this.markChatEnded();
        return true;
      }
      if (normalized.kind === "deleted") {
        this.emit({
          id: `youtube:deleted:${normalized.providerMessageId}`,
          provider: "youtube-live",
          providerMessageId: normalized.providerMessageId,
          timestamp: new Date().toISOString(),
          authorName: "",
          text: "",
          metadata: {
            deleted: true,
            deletedProviderMessageId: normalized.providerMessageId,
            videoId: this.videoId,
            liveChatId: this.liveChatId,
          },
        });
        continue;
      }
      if (normalized.kind !== "message") continue;
      if (this.seen.has(normalized.message.providerMessageId)) continue;
      this.seen.add(normalized.message.providerMessageId);
      if (this.seen.size > 4000) {
        const oldest = this.seen.values().next().value;
        if (oldest) this.seen.delete(oldest);
      }
      this.status = {
        ...this.status,
        lastMessageAt: normalized.message.timestamp,
        lastError: null,
        status: "connected",
        detail: this.streamTitle,
      };
      this.emit(normalized.message);
    }
    return false;
  }

  private markConnected(): void {
    if (this.status.status === "connected" && this.status.detail === this.streamTitle && !this.status.lastError) {
      return;
    }
    this.setStatus({
      status: "connected",
      detail: this.streamTitle,
      meetingOrBroadcastId: this.videoId,
      sourceMode: "live",
      lastError: null,
    });
  }

  private markChatEnded(detail = "YouTube live chat has ended."): void {
    this.setStatus({
      status: "error",
      detail,
      lastError: detail,
      meetingOrBroadcastId: this.videoId,
      sourceMode: "live",
    });
  }

  private now(): number {
    return this.transport?.now?.() ?? Date.now();
  }

  private delay(generation: number, delayMs: number): Promise<void> {
    if (generation !== this.generation) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => resolve();
      if (this.transport?.schedule) {
        this.cancelTimer = this.transport.schedule(finish, delayMs);
        return;
      }
      const timer = setTimeout(finish, delayMs);
      this.cancelTimer = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  private async authorizedGet(
    url: string,
    generation: number,
  ): Promise<{ status: number; body: unknown } | null> {
    const transport = this.transport;
    if (!transport) return null;
    const token = await transport.getAccessToken();
    if (generation !== this.generation) return null;
    if (!token) {
      return {
        status: 401,
        body: { error: { errors: [{ reason: "authError" }] } },
      };
    }
    const first = await transport.fetchJson(url, token);
    if (first.status !== 401 || generation !== this.generation) {
      return first;
    }
    const refreshed = await transport.refreshAccessToken();
    if (!refreshed || generation !== this.generation) {
      return first;
    }
    return transport.fetchJson(url, refreshed);
  }

  private emit(message: LiveChatMessage): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  private setStatus(
    patch: Partial<LiveChatProviderStatus> & Pick<LiveChatProviderStatus, "status">,
  ): LiveChatProviderStatus {
    this.status = {
      ...this.status,
      ...patch,
      provider: "youtube-live",
      label: this.label,
    };
    this.statusListener?.(this.getStatus());
    return this.getStatus();
  }

  private stopLoop(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.activeStream?.close();
    this.activeStream = null;
  }
}
