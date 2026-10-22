import type { LiveChatMessage } from "../types";

/** Official YouTube Data API v3. No scraping. */
export const YOUTUBE_API_ORIGIN = "https://www.googleapis.com/youtube/v3";
export const YOUTUBE_LIVE_CHAT_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
/** Published quota table lists liveChatMessages.list at 1 unit (2026-09-15). streamList has no published row. */
export const YOUTUBE_LIVE_CHAT_LIST_QUOTA_UNITS = 1;
/** Never poll faster than this. Streaming does not use this floor. */
export const YOUTUBE_MIN_POLL_MS = 5000;
export const YOUTUBE_QUOTA_RETRY_MS = 60_000;
export const YOUTUBE_STREAM_RECOVERY_MS = 60_000;
export const YOUTUBE_STREAM_FAILURES_BEFORE_POLL = 3;

export type YouTubeLiveChatStream = {
  responses: AsyncIterable<unknown>;
  close(): void;
};

export type YouTubeLiveChatTransport = {
  isConfigured(): boolean;
  getAccessToken(): Promise<string | null>;
  refreshAccessToken(): Promise<string | null>;
  getAuthState(): {
    authState: string;
    detail: string;
    lastError: string | null;
  };
  fetchJson(
    url: string,
    accessToken: string,
  ): Promise<{ status: number; body: unknown }>;
  /** Primary ingestion. Absent only when the gRPC client cannot be started. */
  openLiveChatStream?(input: {
    liveChatId: string;
    pageToken: string | null;
    accessToken: string;
  }): Promise<YouTubeLiveChatStream>;
  /** Test hook. Production uses setTimeout when omitted. */
  schedule?: (callback: () => void, delayMs: number) => () => void;
  now?: () => number;
};

export class YouTubeStreamError extends Error {
  readonly code: "unauthorized" | "forbidden" | "quota" | "disabled" | "ended" | "unavailable" | "malformed";

  constructor(
    code: "unauthorized" | "forbidden" | "quota" | "disabled" | "ended" | "unavailable" | "malformed",
    message: string,
  ) {
    super(message);
    this.name = "YouTubeStreamError";
    this.code = code;
  }
}

export function resolveYouTubePollDelayMs(pollingIntervalMillis: unknown): number {
  const recommended =
    typeof pollingIntervalMillis === "number"
      ? pollingIntervalMillis
      : Number(pollingIntervalMillis);
  if (!Number.isFinite(recommended) || recommended <= 0) {
    return YOUTUBE_MIN_POLL_MS;
  }
  return Math.max(YOUTUBE_MIN_POLL_MS, Math.round(recommended));
}

export function estimateYouTubeLiveChatUnits(
  pollIntervalMs: number,
  durationMs: number,
): number {
  const interval = Math.max(1, pollIntervalMs);
  const calls = Math.ceil(Math.max(0, durationMs) / interval);
  return calls * YOUTUBE_LIVE_CHAT_LIST_QUOTA_UNITS;
}

type YouTubeAuthor = {
  channelId?: string;
  displayName?: string;
  profileImageUrl?: string;
};

type YouTubeSnippet = {
  type?: string;
  publishedAt?: string;
  displayMessage?: string;
  liveChatId?: string;
  messageDeletedDetails?: { deletedMessageId?: string };
  textMessageDetails?: { messageText?: string };
};

export type YouTubeLiveChatItem = {
  id?: string;
  snippet?: YouTubeSnippet;
  authorDetails?: YouTubeAuthor;
};

const VISIBLE_TYPES = new Set([
  "textMessageEvent",
  "superChatEvent",
  "superStickerEvent",
  "memberMilestoneChatEvent",
  "newSponsorEvent",
  "membershipGiftingEvent",
  "giftMembershipReceivedEvent",
]);

export type NormalizedYouTubeItem =
  | { kind: "message"; message: LiveChatMessage }
  | { kind: "deleted"; providerMessageId: string }
  | { kind: "chat_ended" }
  | { kind: "ignore" };

export function normalizeYouTubeLiveChatItem(
  item: YouTubeLiveChatItem,
  context: { videoId: string; liveChatId: string },
): NormalizedYouTubeItem {
  const type = item.snippet?.type ?? "";
  if (type === "chatEndedEvent" || type === "CHAT_ENDED_EVENT") {
    return { kind: "chat_ended" };
  }
  const deletedId =
    item.snippet?.messageDeletedDetails?.deletedMessageId?.trim() || "";
  if (type === "messageDeletedEvent") {
    if (!deletedId) {
      return { kind: "ignore" };
    }
    return { kind: "deleted", providerMessageId: deletedId };
  }
  if (type === "tombstone" || type === "TOMBSTONE") {
    const tombstoneId = deletedId || item.id?.trim() || "";
    if (!tombstoneId) {
      return { kind: "ignore" };
    }
    return { kind: "deleted", providerMessageId: tombstoneId };
  }
  if (type === "userBannedEvent" || !VISIBLE_TYPES.has(type)) {
    return { kind: "ignore" };
  }
  const providerMessageId = item.id?.trim() || "";
  const text = (
    item.snippet?.textMessageDetails?.messageText ||
    item.snippet?.displayMessage ||
    ""
  ).trim();
  if (!providerMessageId || !text) {
    return { kind: "ignore" };
  }
  const authorName = item.authorDetails?.displayName?.trim() || "YouTube user";
  const avatar = item.authorDetails?.profileImageUrl?.trim() || "";
  const timestamp = item.snippet?.publishedAt || new Date().toISOString();
  return {
    kind: "message",
    message: {
      id: `youtube:${providerMessageId}`,
      provider: "youtube-live",
      providerMessageId,
      timestamp,
      authorId: item.authorDetails?.channelId?.trim() || undefined,
      authorName,
      authorAvatarUrl: avatar || undefined,
      text,
      metadata: {
        videoId: context.videoId,
        liveChatId: context.liveChatId,
        sourceId: context.videoId,
        type,
        providerLabel: "YouTube",
      },
    },
  };
}

export type YouTubeStreamResolution =
  | {
      ok: true;
      videoId: string;
      liveChatId: string;
      title: string;
    }
  | {
      ok: false;
      code:
        | "not_found"
        | "not_live"
        | "ended"
        | "scheduled"
        | "none_active"
        | "multiple"
        | "unauthorized"
        | "forbidden"
        | "quota"
        | "unavailable";
      detail: string;
      options?: Array<{ videoId: string; title: string }>;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function itemsOf(body: unknown): Array<Record<string, unknown>> {
  const record = asRecord(body);
  const items = record?.items;
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)))
    : [];
}

export function youtubeErrorReason(body: unknown): string | null {
  const record = asRecord(body);
  const error = asRecord(record?.error);
  const errors = error?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const reason = asRecord(errors[0])?.reason;
    if (typeof reason === "string" && reason.trim()) {
      return reason.trim();
    }
  }
  if (typeof record?.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  return null;
}

export function classifyYouTubeHttpFailure(
  status: number,
  body: unknown,
): YouTubeStreamResolution {
  const reason = youtubeErrorReason(body);
  if (status === 401 || reason === "invalid_grant" || reason === "authError") {
    return {
      ok: false,
      code: "unauthorized",
      detail:
        "YouTube authorization expired or was revoked. Connect the YouTube account again.",
    };
  }
  if (
    status === 403 &&
    (reason === "quotaExceeded" || reason === "rateLimitExceeded" || reason === "dailyLimitExceeded")
  ) {
    return {
      ok: false,
      code: "quota",
      detail: "YouTube API quota or rate limit was reached. NEUD will retry.",
    };
  }
  if (status === 403 && reason === "liveChatDisabled") {
    return {
      ok: false,
      code: "not_live",
      detail: "Live chat is disabled for this broadcast.",
    };
  }
  if (status === 403 && reason === "liveChatEnded") {
    return {
      ok: false,
      code: "ended",
      detail: "YouTube live chat has ended.",
    };
  }
  if (status === 403) {
    return {
      ok: false,
      code: "forbidden",
      detail: "YouTube denied access to this live chat.",
    };
  }
  if (status === 404) {
    return {
      ok: false,
      code: "not_found",
      detail: "YouTube video was not found.",
    };
  }
  return {
    ok: false,
    code: "unavailable",
    detail: "YouTube request failed. NEUD will retry.",
  };
}

export function interpretVideosList(
  body: unknown,
  requestedId: string,
): YouTubeStreamResolution {
  const items = itemsOf(body);
  if (items.length === 0) {
    return {
      ok: false,
      code: "not_found",
      detail: `YouTube video ${requestedId} was not found.`,
    };
  }
  const item = items[0]!;
  const id = typeof item.id === "string" ? item.id : requestedId;
  const snippet = asRecord(item.snippet);
  const live = asRecord(item.liveStreamingDetails);
  const title = typeof snippet?.title === "string" && snippet.title.trim()
    ? snippet.title.trim()
    : id;
  const liveChatId =
    typeof live?.activeLiveChatId === "string" ? live.activeLiveChatId.trim() : "";
  const broadcastContent =
    typeof snippet?.liveBroadcastContent === "string"
      ? snippet.liveBroadcastContent
      : "";
  const actualEnd =
    typeof live?.actualEndTime === "string" ? live.actualEndTime.trim() : "";
  if (liveChatId) {
    return { ok: true, videoId: id, liveChatId, title };
  }
  if (broadcastContent === "upcoming") {
    return {
      ok: false,
      code: "scheduled",
      detail: `${title} is scheduled and not live yet.`,
    };
  }
  if (actualEnd || broadcastContent === "none") {
    return {
      ok: false,
      code: "ended",
      detail: `${title} has ended.`,
    };
  }
  return {
    ok: false,
    code: "not_live",
    detail: `${title} does not have an active live chat.`,
  };
}

export function interpretActiveBroadcasts(body: unknown): YouTubeStreamResolution {
  const live = itemsOf(body).flatMap((item) => {
    const snippet = asRecord(item.snippet);
    const status = asRecord(item.status);
    const lifeCycle = typeof status?.lifeCycleStatus === "string" ? status.lifeCycleStatus : "";
    if (lifeCycle && lifeCycle !== "live") {
      return [];
    }
    const videoId = typeof item.id === "string" ? item.id.trim() : "";
    const liveChatId =
      typeof snippet?.liveChatId === "string" ? snippet.liveChatId.trim() : "";
    const title =
      typeof snippet?.title === "string" && snippet.title.trim()
        ? snippet.title.trim()
        : videoId;
    if (!videoId || !liveChatId) {
      return [];
    }
    return [{ videoId, liveChatId, title }];
  });
  if (live.length === 0) {
    return {
      ok: false,
      code: "none_active",
      detail: "No active YouTube live stream was found for this account.",
    };
  }
  if (live.length > 1) {
    return {
      ok: false,
      code: "multiple",
      detail: "More than one YouTube live stream is active. Enter the video ID to choose one.",
      options: live.map((entry) => ({ videoId: entry.videoId, title: entry.title })),
    };
  }
  const only = live[0]!;
  return {
    ok: true,
    videoId: only.videoId,
    liveChatId: only.liveChatId,
    title: only.title,
  };
}

export function interpretLiveChatPage(body: unknown): {
  pollingIntervalMillis: number;
  nextPageToken: string | null;
  items: YouTubeLiveChatItem[];
  offline: boolean;
} {
  const record = asRecord(body);
  const pollingIntervalMillis = resolveYouTubePollDelayMs(record?.pollingIntervalMillis);
  const nextPageToken =
    typeof record?.nextPageToken === "string" && record.nextPageToken.trim()
      ? record.nextPageToken
      : null;
  const offline = Boolean(record?.offlineAt);
  const items = itemsOf(body) as YouTubeLiveChatItem[];
  return { pollingIntervalMillis, nextPageToken, items, offline };
}

export function videosListUrl(videoId: string): string {
  const params = new URLSearchParams({
    part: "snippet,liveStreamingDetails",
    id: videoId,
  });
  return `${YOUTUBE_API_ORIGIN}/videos?${params.toString()}`;
}

export function activeBroadcastsUrl(): string {
  const params = new URLSearchParams({
    part: "snippet,status",
    broadcastStatus: "active",
    mine: "true",
    maxResults: "10",
  });
  return `${YOUTUBE_API_ORIGIN}/liveBroadcasts?${params.toString()}`;
}

export function liveChatMessagesUrl(liveChatId: string, pageToken: string | null): string {
  const params = new URLSearchParams({
    part: "snippet,authorDetails",
    liveChatId,
    maxResults: "200",
  });
  if (pageToken) {
    params.set("pageToken", pageToken);
  }
  return `${YOUTUBE_API_ORIGIN}/liveChat/messages?${params.toString()}`;
}

const GRPC_CHAT_TYPES: Record<string, string> = {
  TEXT_MESSAGE_EVENT: "textMessageEvent",
  TOMBSTONE: "tombstone",
  CHAT_ENDED_EVENT: "chatEndedEvent",
  USER_BANNED_EVENT: "userBannedEvent",
  SUPER_CHAT_EVENT: "superChatEvent",
  SUPER_STICKER_EVENT: "superStickerEvent",
  NEW_SPONSOR_EVENT: "newSponsorEvent",
  MEMBER_MILESTONE_CHAT_EVENT: "memberMilestoneChatEvent",
  MEMBERSHIP_GIFTING_EVENT: "membershipGiftingEvent",
  GIFT_MEMBERSHIP_RECEIVED_EVENT: "giftMembershipReceivedEvent",
};

/** Accept either a REST list page or a gRPC streamList page. */
export function coerceYouTubeChatPage(page: unknown): unknown {
  const record = asRecord(page);
  if (!record) return page;
  const items = itemsOf(page).map((item) => {
    const snippet = asRecord(item.snippet);
    if (!snippet || typeof snippet.type !== "string") return item;
    const mapped = GRPC_CHAT_TYPES[snippet.type] ?? snippet.type;
    return { ...item, snippet: { ...snippet, type: mapped } };
  });
  return { ...record, items };
}
