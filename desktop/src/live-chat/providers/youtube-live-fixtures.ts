/**
 * Official-API-shaped fixtures for YouTube Live Chat regression tests.
 * These do not replace a real live-stream validation.
 */

export const YOUTUBE_FIXTURE_VIDEO_ID = "dQw4w9WgXcQ";
export const YOUTUBE_FIXTURE_CHAT_ID = "fixtureLiveChatId";

export function youtubeFixtureVideoLive(videoId = YOUTUBE_FIXTURE_VIDEO_ID) {
  return {
    items: [
      {
        id: videoId,
        snippet: {
          title: "Fixture Live Stream",
          liveBroadcastContent: "live",
        },
        liveStreamingDetails: {
          activeLiveChatId: YOUTUBE_FIXTURE_CHAT_ID,
          actualStartTime: "2026-10-07T18:00:00.000Z",
        },
      },
    ],
  };
}

export function youtubeFixtureVideoScheduled() {
  return {
    items: [
      {
        id: "scheduledVideo",
        snippet: {
          title: "Upcoming Auction",
          liveBroadcastContent: "upcoming",
        },
        liveStreamingDetails: {
          scheduledStartTime: "2026-10-08T18:00:00.000Z",
        },
      },
    ],
  };
}

export function youtubeFixtureVideoEnded() {
  return {
    items: [
      {
        id: "endedVideo",
        snippet: {
          title: "Ended Auction",
          liveBroadcastContent: "none",
        },
        liveStreamingDetails: {
          actualEndTime: "2026-10-07T19:00:00.000Z",
        },
      },
    ],
  };
}

export function youtubeFixtureActiveBroadcasts(
  broadcasts: Array<{ videoId: string; title: string; liveChatId: string }>,
) {
  return {
    items: broadcasts.map((broadcast) => ({
      id: broadcast.videoId,
      snippet: {
        title: broadcast.title,
        liveChatId: broadcast.liveChatId,
      },
      status: { lifeCycleStatus: "live" },
    })),
  };
}

export function youtubeFixtureChatPage(input: {
  pollingIntervalMillis: number;
  nextPageToken?: string | null;
  messages?: Array<{
    id: string;
    text: string;
    author: string;
    authorId?: string;
    avatar?: string;
    publishedAt: string;
  }>;
  deletedIds?: string[];
  tombstoneWithoutId?: boolean;
  chatEnded?: boolean;
  banned?: boolean;
}) {
  const items = [];
  for (const message of input.messages ?? []) {
    items.push({
      id: message.id,
      snippet: {
        type: "textMessageEvent",
        publishedAt: message.publishedAt,
        displayMessage: message.text,
        textMessageDetails: { messageText: message.text },
        liveChatId: YOUTUBE_FIXTURE_CHAT_ID,
      },
      authorDetails: {
        channelId: message.authorId ?? `channel-${message.author}`,
        displayName: message.author,
        profileImageUrl: message.avatar ?? `https://example.test/${message.author}.png`,
      },
    });
  }
  for (const deletedId of input.deletedIds ?? []) {
    items.push({
      id: `deleted-event-${deletedId}`,
      snippet: {
        type: "messageDeletedEvent",
        publishedAt: "2026-10-07T18:05:00.000Z",
        messageDeletedDetails: { deletedMessageId: deletedId },
      },
    });
  }
  if (input.tombstoneWithoutId) {
    items.push({
      id: "tombstone-no-target",
      snippet: { type: "tombstone", publishedAt: "2026-10-07T18:05:01.000Z" },
    });
  }
  if (input.chatEnded) {
    items.push({
      id: "chat-ended",
      snippet: { type: "chatEndedEvent", publishedAt: "2026-10-07T19:00:00.000Z" },
    });
  }
  if (input.banned) {
    items.push({
      id: "banned-user",
      snippet: {
        type: "userBannedEvent",
        publishedAt: "2026-10-07T18:06:00.000Z",
        displayMessage: "A user was banned",
      },
    });
  }
  return {
    pollingIntervalMillis: input.pollingIntervalMillis,
    nextPageToken: input.nextPageToken ?? "next-page",
    items,
  };
}

export function youtubeQuotaErrorBody() {
  return {
    error: {
      code: 403,
      message: "quota",
      errors: [{ reason: "quotaExceeded", message: "quota" }],
    },
  };
}
