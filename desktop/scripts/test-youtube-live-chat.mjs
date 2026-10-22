#!/usr/bin/env node
/**
 * YouTube Live Chat regression fixtures.
 * Exercises the official-API normalizer, polling interval, queue, and permissions
 * without a live broadcast. A real YouTube stream still has to be validated manually.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function importSrc(relativePath) {
  return import(pathToFileURL(path.join(desktopRoot, relativePath)).href);
}

async function flush() {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createTransport(initial) {
  const scheduled = [];
  const pages = [];
  const calls = [];
  let videoBody = initial.videoBody;
  let broadcastsBody = initial.broadcastsBody ?? { items: [] };
  let token = "access-token";
  let refreshes = 0;
  const transport = {
    isConfigured: () => true,
    getAccessToken: async () => token,
    refreshAccessToken: async () => {
      refreshes += 1;
      token = "refreshed-access-token";
      return token;
    },
    getAuthState: () => ({
      authState: "connected",
      detail: "YouTube account connected.",
      lastError: null,
    }),
    schedule(callback, delayMs) {
      const entry = { callback, delayMs };
      scheduled.push(entry);
      return () => {
        const index = scheduled.indexOf(entry);
        if (index >= 0) scheduled.splice(index, 1);
      };
    },
    async fetchJson(url) {
      calls.push(url);
      assert.equal(url.includes("access-token"), false);
      assert.equal(url.includes("refreshed-access-token"), false);
      if (url.includes("/videos?")) {
        return { status: initial.videoStatus ?? 200, body: videoBody };
      }
      if (url.includes("/liveBroadcasts?")) {
        return { status: 200, body: broadcastsBody };
      }
      if (url.includes("/liveChat/messages")) {
        const next = pages.shift();
        if (!next) {
          return {
            status: 200,
            body: { items: [], pollingIntervalMillis: 8000 },
          };
        }
        if (typeof next.status === "number" && Object.prototype.hasOwnProperty.call(next, "body")) {
          return next;
        }
        return { status: 200, body: next };
      }
      return { status: 404, body: {} };
    },
  };
  return {
    transport,
    scheduled,
    pages,
    calls,
    get refreshes() {
      return refreshes;
    },
    setVideoBody(body) {
      videoBody = body;
    },
    setVideoStatus(status) {
      initial.videoStatus = status;
    },
    setBroadcastsBody(body) {
      broadcastsBody = body;
    },
  };
}

test("YouTube fixtures normalize text, emoji, unicode, and deletion ids", async () => {
  const api = await importSrc("src/live-chat/providers/youtube-live-api.ts");
  const fixtures = await importSrc("src/live-chat/providers/youtube-live-fixtures.ts");
  const page = fixtures.youtubeFixtureChatPage({
    pollingIntervalMillis: 1500,
    messages: [
      {
        id: "m1",
        text: "Hello, auction!",
        author: "Ada",
        authorId: "channel-ada",
        publishedAt: "2026-10-07T18:01:00.000Z",
      },
      {
        id: "m2",
        text: "Bid 😀 東京 — “yes”",
        author: "宝",
        publishedAt: "2026-10-07T18:01:02.000Z",
      },
      {
        id: "m3",
        text: "L".repeat(500),
        author: "A very long channel name that should stay intact",
        publishedAt: "2026-10-07T18:01:03.000Z",
      },
    ],
    deletedIds: ["m1"],
    tombstoneWithoutId: true,
    banned: true,
  });
  const normalized = page.items.map((item) =>
    api.normalizeYouTubeLiveChatItem(item, {
      videoId: "vid",
      liveChatId: "chat",
    }),
  );
  assert.equal(normalized[0].kind, "message");
  assert.equal(normalized[0].message.authorName, "Ada");
  assert.equal(normalized[0].message.authorAvatarUrl.includes("Ada"), true);
  assert.equal(normalized[0].message.provider, "youtube-live");
  assert.equal(normalized[0].message.providerMessageId, "m1");
  assert.equal(normalized[0].message.metadata.videoId, "vid");
  assert.equal(normalized[1].message.text, "Bid 😀 東京 — “yes”");
  assert.equal(normalized[2].message.text.length, 500);
  assert.equal(normalized[3].kind, "deleted");
  assert.equal(normalized[3].providerMessageId, "m1");
  assert.equal(normalized[4].kind, "deleted");
  assert.equal(normalized[4].providerMessageId, "tombstone-no-target");
  assert.equal(normalized[5].kind, "ignore");
  assert.equal(api.resolveYouTubePollDelayMs(1500), 5000);
  assert.equal(api.resolveYouTubePollDelayMs(12000), 12000);
  assert.equal(api.estimateYouTubeLiveChatUnits(10000, 4 * 60 * 60 * 1000), 1440);
});

test("YouTube stream resolution covers live, scheduled, ended, missing, and multiple", async () => {
  const api = await importSrc("src/live-chat/providers/youtube-live-api.ts");
  const fixtures = await importSrc("src/live-chat/providers/youtube-live-fixtures.ts");
  const live = api.interpretVideosList(fixtures.youtubeFixtureVideoLive(), "dQw4w9WgXcQ");
  assert.equal(live.ok, true);
  assert.equal(live.liveChatId, fixtures.YOUTUBE_FIXTURE_CHAT_ID);
  const scheduled = api.interpretVideosList(fixtures.youtubeFixtureVideoScheduled(), "scheduledVideo");
  assert.equal(scheduled.code, "scheduled");
  const ended = api.interpretVideosList(fixtures.youtubeFixtureVideoEnded(), "endedVideo");
  assert.equal(ended.code, "ended");
  const missing = api.interpretVideosList({ items: [] }, "missing");
  assert.equal(missing.code, "not_found");
  const none = api.interpretActiveBroadcasts({ items: [] });
  assert.equal(none.code, "none_active");
  const multiple = api.interpretActiveBroadcasts(
    fixtures.youtubeFixtureActiveBroadcasts([
      { videoId: "a", title: "One", liveChatId: "c1" },
      { videoId: "b", title: "Two", liveChatId: "c2" },
    ]),
  );
  assert.equal(multiple.code, "multiple");
  assert.equal(multiple.options.length, 2);
});

test("YouTube provider honors polling interval, skips backlog, and refreshes once on 401", async () => {
  const { YouTubeLiveChatProvider } = await importSrc("src/live-chat/providers/youtube-provider.ts");
  const fixtures = await importSrc("src/live-chat/providers/youtube-live-fixtures.ts");
  const harness = createTransport({ videoBody: fixtures.youtubeFixtureVideoLive() });
  harness.pages.push(
    fixtures.youtubeFixtureChatPage({
      pollingIntervalMillis: 1500,
      messages: [
        {
          id: "old",
          text: "before connect",
          author: "Old",
          publishedAt: "2026-10-07T18:00:00.000Z",
        },
      ],
    }),
  );
  harness.pages.push(
    fixtures.youtubeFixtureChatPage({
      pollingIntervalMillis: 12000,
      messages: [
        {
          id: "m1",
          text: "Hello, auction!",
          author: "Ada",
          publishedAt: "2026-10-07T18:01:00.000Z",
        },
        {
          id: "m1",
          text: "Hello, auction!",
          author: "Ada",
          publishedAt: "2026-10-07T18:01:00.000Z",
        },
        {
          id: "m2",
          text: "Second",
          author: "宝",
          publishedAt: "2026-10-07T18:01:02.000Z",
        },
      ],
    }),
  );
  const provider = new YouTubeLiveChatProvider();
  provider.setIntegration(harness.transport);
  const received = [];
  provider.subscribeMessages((message) => received.push(message));
  const status = await provider.connect({ videoOrBroadcastId: "dQw4w9WgXcQ" });
  assert.equal(status.status, "connected");
  assert.equal(status.detail, "Fixture Live Stream");
  await flush();
  assert.equal(received.length, 0);
  assert.equal(harness.scheduled.length, 1);
  assert.equal(harness.scheduled[0].delayMs, 5000);
  harness.scheduled[0].callback();
  await flush();
  assert.deepEqual(
    received.map((message) => message.providerMessageId),
    ["m1", "m2"],
  );
  assert.equal(harness.scheduled.at(-1).delayMs, 12000);
  assert.equal(JSON.stringify(provider.getStatus()).includes("access-token"), false);
  assert.equal(JSON.stringify(provider.getDiagnostics()).includes("access-token"), false);

  harness.pages.push({ status: 401, body: { error: { errors: [{ reason: "authError" }] } } });
  harness.pages.push(
    fixtures.youtubeFixtureChatPage({
      pollingIntervalMillis: 8000,
      messages: [],
    }),
  );
  const before = harness.refreshes;
  harness.scheduled.at(-1).callback();
  await flush();
  assert.equal(harness.refreshes, before + 1);
  assert.equal(provider.getStatus().status, "connected");
});

test("YouTube provider reports quota, missing chat, and chat end without crashing", async () => {
  const { YouTubeLiveChatProvider } = await importSrc("src/live-chat/providers/youtube-provider.ts");
  const fixtures = await importSrc("src/live-chat/providers/youtube-live-fixtures.ts");
  const api = await importSrc("src/live-chat/providers/youtube-live-api.ts");
  const harness = createTransport({
    videoBody: fixtures.youtubeFixtureVideoLive(),
  });
  const provider = new YouTubeLiveChatProvider();
  provider.setIntegration(harness.transport);
  harness.pages.push(fixtures.youtubeFixtureChatPage({ pollingIntervalMillis: 8000, messages: [] }));
  await provider.connect({ videoOrBroadcastId: "dQw4w9WgXcQ" });
  await flush();
  harness.pages.push({ status: 403, body: fixtures.youtubeQuotaErrorBody() });
  harness.scheduled.at(-1).callback();
  await flush();
  assert.match(provider.getStatus().detail, /quota/);
  assert.equal(harness.scheduled.at(-1).delayMs, api.YOUTUBE_QUOTA_RETRY_MS);

  harness.setVideoBody(fixtures.youtubeFixtureVideoScheduled());
  const scheduled = await provider.connect({ videoOrBroadcastId: "abcdefghijk" });
  assert.equal(scheduled.status, "error");
  assert.match(scheduled.detail, /not live yet/);

  harness.setVideoBody({ items: [] });
  const missing = await provider.connect({ videoOrBroadcastId: "missingVid1" });
  assert.match(missing.detail, /not found/);

  harness.setVideoBody(fixtures.youtubeFixtureVideoLive());
  harness.pages.push(
    fixtures.youtubeFixtureChatPage({ pollingIntervalMillis: 8000, messages: [], chatEnded: false }),
  );
  await provider.connect({ videoOrBroadcastId: "dQw4w9WgXcQ" });
  await flush();
  harness.pages.push(
    fixtures.youtubeFixtureChatPage({ pollingIntervalMillis: 8000, chatEnded: true, messages: [] }),
  );
  harness.scheduled.at(-1).callback();
  await flush();
  assert.match(provider.getStatus().detail, /chat has ended/);
});

test("Live Chat ingest keeps producer order, drops duplicates, and clears deleted messages", async () => {
  const { ingestLiveChatMessage } = await importSrc("src/live-chat/live-chat-ingest.ts");
  const session = {
    config: { mode: "producer" },
    incoming: [],
    approved: [],
    current: null,
    receivedCount: 0,
    approvedCount: 0,
  };
  const ada = {
    id: "youtube:m1",
    provider: "youtube-live",
    providerMessageId: "m1",
    timestamp: "2026-10-07T18:01:00.000Z",
    authorName: "Ada",
    text: "Hello, auction!",
    metadata: { videoId: "vid" },
  };
  const bao = {
    ...ada,
    id: "youtube:m2",
    providerMessageId: "m2",
    timestamp: "2026-10-07T18:01:02.000Z",
    authorName: "宝",
    text: "Bid 😀",
  };
  ingestLiveChatMessage(session, ada);
  ingestLiveChatMessage(session, bao);
  ingestLiveChatMessage(session, ada);
  assert.deepEqual(
    session.incoming.map((message) => message.providerMessageId),
    ["m2", "m1"],
  );
  assert.equal(session.receivedCount, 2);
  session.incoming = session.incoming.filter((message) => message.id !== "youtube:m1");
  session.approved = [ada];
  session.current = ada;
  session.approvedCount = 1;
  const cleared = ingestLiveChatMessage(session, {
    ...ada,
    id: "youtube:deleted:m1",
    text: "",
    metadata: { deleted: true, deletedProviderMessageId: "m1" },
  });
  assert.equal(cleared, true);
  assert.equal(session.current, null);
  assert.equal(session.approved.length, 0);
  const automatic = {
    config: { mode: "automatic" },
    incoming: [],
    approved: [],
    current: null,
    receivedCount: 0,
    approvedCount: 0,
  };
  ingestLiveChatMessage(automatic, ada);
  ingestLiveChatMessage(automatic, bao);
  assert.equal(automatic.current.providerMessageId, "m2");
  const service = read("desktop/src/live-chat/live-chat-service.ts");
  assert.match(service, /YouTube live source changed to/);
  assert.match(service, /resumeConnection/);
  assert.doesNotMatch(service, /type:\s*["']live-chat\.message/);
});

test("Live Chat permissions keep viewers read-only and let operators set a YouTube URL", async () => {
  const { assertLiveChatPost } = await importSrc("src/live-chat/live-chat-permissions.ts");
  assert.doesNotThrow(() =>
    assertLiveChatPost({ role: "viewer", action: "state" }),
  );
  assert.throws(
    () => assertLiveChatPost({ role: "viewer", action: "take" }),
    /read-only/,
  );
  assert.throws(
    () => assertLiveChatPost({ role: "operator", action: "select-provider" }),
    /configure/,
  );
  assert.doesNotThrow(() =>
    assertLiveChatPost({
      role: "operator",
      action: "connect",
      provider: "youtube-live",
      currentStreamId: "old",
      nextStreamId: "new",
    }),
  );
  assert.doesNotThrow(() =>
    assertLiveChatPost({
      role: "operator",
      action: "connect",
      provider: "youtube-live",
      currentStreamId: "same",
      nextStreamId: "same",
    }),
  );
  assert.doesNotThrow(() =>
    assertLiveChatPost({
      role: "admin",
      action: "connect",
      provider: "youtube-live",
      currentStreamId: "",
      nextStreamId: "new",
    }),
  );
  assert.doesNotThrow(() =>
    assertLiveChatPost({ role: "operator", action: "hide-current" }),
  );
});

test("YouTube OAuth URL is PKCE loopback and credentials stay in safeStorage", async () => {
  const oauth = await importSrc("src/integrations/youtube/youtube-oauth.ts");
  const url = oauth.buildYouTubeAuthorizeUrl({
    clientId: "public-client-id",
    redirectUri: "http://127.0.0.1:54321/oauth/youtube/callback",
    state: "state",
    codeChallenge: "challenge",
  });
  assert.match(url, /code_challenge_method=S256/);
  assert.match(url, /youtube\.readonly/);
  assert.equal(url.includes("include_granted_scopes"), false);
  assert.equal(url.includes("client_secret"), false);
  assert.equal(oauth.youtubeLoopbackRedirectUri(54321), "http://127.0.0.1:54321");
  assert.equal(url.includes("refresh_token"), false);
  const store = read("desktop/src/integrations/youtube/youtube-credential-store.ts");
  assert.match(store, /safeStorage/);
  assert.match(store, /youtube-app\.cred/);
  assert.match(store, /credentialsDir/);
  assert.doesNotMatch(store, /writeFileSync\(file, JSON\.stringify/);
  const provider = read("desktop/src/live-chat/providers/youtube-provider.ts");
  assert.match(provider, /resolveYouTubePollDelayMs/);
  assert.doesNotMatch(provider, /console\.(log|info|debug)/);
  const overlay = read("desktop/src/displays/bundled/live-chat-overlay-v1.html");
  assert.match(overlay, /neud-display-runtime\.js/);
  assert.match(overlay, /background: transparent/);
  assert.match(overlay, /id="avatar"/);
  assert.match(overlay, /id="badge"/);
  assert.match(overlay, /width=3840, height=2160/);
  const api = read("desktop/src/services/local-api-server.ts");
  assert.match(api, /assertLiveChatPost/);
  assert.match(api, /\/api\/integrations\/youtube/);
  const stream = read("desktop/src/integrations/youtube/youtube-live-chat-stream.ts");
  assert.match(stream, /authorization/);
  assert.match(stream, /StreamList/);
  assert.doesNotMatch(stream, /console\.(log|info|debug)/);
  const ui = read("src/components/live-chat/LiveChatClient.tsx");
  assert.match(ui, /YouTube Live URL or Video ID/);
  assert.match(ui, /Connected as/);
});

test("YouTube URL parser accepts watch, share, and live links", async () => {
  const { parseYouTubeVideoId } = await importSrc("src/live-chat/providers/youtube-video-id.ts");
  const id = "abcdefghijk";
  assert.deepEqual(parseYouTubeVideoId(id), { ok: true, videoId: id });
  assert.deepEqual(parseYouTubeVideoId(`  ${id}  `), { ok: true, videoId: id });
  assert.deepEqual(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${id}`), {
    ok: true,
    videoId: id,
  });
  assert.deepEqual(parseYouTubeVideoId(`https://youtube.com/watch?v=${id}&t=30s`), {
    ok: true,
    videoId: id,
  });
  assert.deepEqual(parseYouTubeVideoId(`https://youtu.be/${id}?si=share`), {
    ok: true,
    videoId: id,
  });
  assert.deepEqual(parseYouTubeVideoId(`https://www.youtube.com/live/${id}?feature=share`), {
    ok: true,
    videoId: id,
  });
  assert.deepEqual(parseYouTubeVideoId(`https://youtube.com/live/${id}`), {
    ok: true,
    videoId: id,
  });
  assert.equal(parseYouTubeVideoId("https://vimeo.com/123456789").ok, false);
  assert.equal(parseYouTubeVideoId("https://example.com/watch?v=abcdefghijk").ok, false);
  assert.equal(parseYouTubeVideoId("not a youtube link").ok, false);
  assert.match(parseYouTubeVideoId("https://youtube.com/playlist?list=PL123").error, /video ID|watch or live/);
});

function controllableStream() {
  const queue = [];
  let waiter = null;
  let ended = false;
  let error = null;
  const notify = () => {
    const current = waiter;
    waiter = null;
    current?.();
  };
  return {
    push(value) {
      queue.push(value);
      notify();
    },
    end() {
      ended = true;
      notify();
    },
    fail(err) {
      error = err;
      ended = true;
      notify();
    },
    handle: {
      responses: {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              while (queue.length === 0 && !ended && !error) {
                await new Promise((resolve) => {
                  waiter = resolve;
                });
              }
              if (queue.length > 0) {
                return { done: false, value: queue.shift() };
              }
              if (error) throw error;
              return { done: true, value: undefined };
            },
          };
        },
      },
      close() {
        ended = true;
        notify();
      },
    },
  };
}

test("YouTube streaming ingestion is immediate, ordered, and deduped", async () => {
  const { YouTubeLiveChatProvider } = await importSrc("src/live-chat/providers/youtube-provider.ts");
  const fixtures = await importSrc("src/live-chat/providers/youtube-live-fixtures.ts");
  const harness = createTransport({ videoBody: fixtures.youtubeFixtureVideoLive() });
  const opened = [];
  let active = null;
  harness.transport.openLiveChatStream = async (input) => {
    opened.push(input.pageToken);
    active = controllableStream();
    return active.handle;
  };
  const provider = new YouTubeLiveChatProvider();
  provider.setIntegration(harness.transport);
  const received = [];
  const arrivals = [];
  provider.subscribeMessages((message) => {
    arrivals.push(Date.now());
    received.push(message);
  });
  const status = await provider.connect({
    videoOrBroadcastId: "https://www.youtube.com/watch?v=fixtureVideoId123&t=12s",
  });
  assert.equal(status.status, "error");
  await provider.connect({
    videoOrBroadcastId: " https://www.youtube.com/live/dQw4w9WgXcQ?feature=share ",
  });
  await flush();
  assert.equal(harness.calls.some((url) => url.includes("id=dQw4w9WgXcQ")), true);
  assert.equal(harness.calls.some((url) => url.includes("mine=true")), false);
  assert.equal(harness.calls.some((url) => url.includes("/liveChat/messages")), false);
  assert.equal(opened.length, 1);
  assert.equal(opened[0], null);
  assert.equal(provider.getDiagnostics().ingestionMode, "streaming");

  active.push(
    fixtures.youtubeFixtureChatPage({
      pollingIntervalMillis: 1500,
      nextPageToken: "cursor-1",
      messages: [{ id: "old", text: "history", author: "Old", publishedAt: "2026-10-07T18:00:00.000Z" }],
    }),
  );
  await flush();
  assert.equal(received.length, 0);
  assert.equal(harness.scheduled.length, 0);

  const sentAt = Date.now();
  active.push(
    fixtures.youtubeFixtureChatPage({
      pollingIntervalMillis: 1500,
      nextPageToken: "cursor-2",
      messages: [
        { id: "m1", text: "First", author: "Ada", authorId: "channel-ada", publishedAt: "2026-10-07T18:01:00.000Z" },
        { id: "m1", text: "First", author: "Ada", publishedAt: "2026-10-07T18:01:00.000Z" },
        { id: "m2", text: "Second", author: "宝", publishedAt: "2026-10-07T18:01:02.000Z" },
      ],
    }),
  );
  await flush();
  assert.deepEqual(received.map((message) => message.providerMessageId), ["m1", "m2"]);
  assert.ok(arrivals[0] - sentAt < 250);
  assert.equal(received[0].authorId, "channel-ada");
  assert.equal(received[0].metadata.videoId, "dQw4w9WgXcQ");
  assert.equal(received[0].metadata.liveChatId, fixtures.YOUTUBE_FIXTURE_CHAT_ID);
  assert.equal(provider.getDiagnostics().lastMessageAt, "2026-10-07T18:01:02.000Z");

  active.push(
    fixtures.youtubeFixtureChatPage({
      pollingIntervalMillis: 1500,
      nextPageToken: "cursor-3",
      messages: [],
      deletedIds: ["m1"],
    }),
  );
  await flush();
  const deletion = received.at(-1);
  assert.equal(deletion.metadata.deleted, true);
  assert.equal(deletion.metadata.deletedProviderMessageId, "m1");
});

test("YouTube streaming reconnects, refreshes tokens, and recovers from polling", async () => {
  const { YouTubeLiveChatProvider } = await importSrc("src/live-chat/providers/youtube-provider.ts");
  const { YouTubeStreamError, YOUTUBE_QUOTA_RETRY_MS, YOUTUBE_STREAM_RECOVERY_MS } = await importSrc(
    "src/live-chat/providers/youtube-live-api.ts",
  );
  const fixtures = await importSrc("src/live-chat/providers/youtube-live-fixtures.ts");
  const harness = createTransport({ videoBody: fixtures.youtubeFixtureVideoLive() });
  let now = 1_000_000;
  harness.transport.now = () => now;
  const opened = [];
  let opens = 0;
  let active = null;
  harness.transport.openLiveChatStream = async (input) => {
    opens += 1;
    opened.push({ pageToken: input.pageToken, attempt: opens });
    if (opens === 1) {
      throw new YouTubeStreamError("unauthorized", "expired");
    }
    if (opens === 3 || opens === 4) {
      throw new YouTubeStreamError("unavailable", "closed");
    }
    active = controllableStream();
    return active.handle;
  };

  const provider = new YouTubeLiveChatProvider();
  provider.setIntegration(harness.transport);
  const received = [];
  provider.subscribeMessages((message) => received.push(message));
  await provider.connect({ videoOrBroadcastId: "dQw4w9WgXcQ" });
  await flush();
  assert.equal(harness.refreshes, 1);
  assert.equal(opens, 2);
  assert.equal(provider.getStatus().status, "connected");

  active.push(
    fixtures.youtubeFixtureChatPage({
      pollingIntervalMillis: 8000,
      nextPageToken: "cursor-1",
      messages: [{ id: "m1", text: "Live", author: "Ada", publishedAt: "2026-10-07T18:02:00.000Z" }],
    }),
  );
  await flush();
  assert.equal(received.length, 0);
  active.push(
    fixtures.youtubeFixtureChatPage({
      pollingIntervalMillis: 8000,
      nextPageToken: "cursor-2",
      messages: [{ id: "m1", text: "Live", author: "Ada", publishedAt: "2026-10-07T18:02:00.000Z" }],
    }),
  );
  await flush();
  assert.equal(received.length, 1);
  active.end();
  await flush();
  assert.equal(harness.scheduled.at(-1).delayMs, 1000);
  harness.scheduled.at(-1).callback();
  await flush();
  assert.equal(harness.scheduled.at(-1).delayMs, 2000);
  harness.scheduled.at(-1).callback();
  await flush();
  assert.equal(provider.getDiagnostics().ingestionMode, "polling");
  assert.equal(harness.calls.some((url) => url.includes("/liveChat/messages")), true);

  now += YOUTUBE_STREAM_RECOVERY_MS;
  harness.pages.push(
    fixtures.youtubeFixtureChatPage({ pollingIntervalMillis: 8000, messages: [] }),
  );
  harness.scheduled.at(-1).callback();
  await flush();
  assert.equal(provider.getDiagnostics().ingestionMode, "streaming");
  assert.equal(opens, 5);
  active.fail(new YouTubeStreamError("quota", "quota"));
  await flush();
  assert.equal(harness.scheduled.at(-1).delayMs, YOUTUBE_QUOTA_RETRY_MS);
  assert.equal(provider.getDiagnostics().ingestionMode, "streaming");

  harness.scheduled.at(-1).callback();
  await flush();
  assert.equal(opens, 6);
  active.push(
    fixtures.youtubeFixtureChatPage({
      pollingIntervalMillis: 8000,
      nextPageToken: "cursor-9",
      messages: [{ id: "m2", text: "After recovery", author: "Ada", publishedAt: "2026-10-07T18:03:00.000Z" }],
    }),
  );
  await flush();
  assert.deepEqual(received.map((message) => message.providerMessageId), ["m1", "m2"]);
  assert.equal(opened[2].pageToken, "cursor-2");
});

test("YouTube streaming stops on chat end and disabled chat, and resolves third-party videos", async () => {
  const { YouTubeLiveChatProvider } = await importSrc("src/live-chat/providers/youtube-provider.ts");
  const { YouTubeStreamError } = await importSrc("src/live-chat/providers/youtube-live-api.ts");
  const fixtures = await importSrc("src/live-chat/providers/youtube-live-fixtures.ts");
  const harness = createTransport({ videoBody: fixtures.youtubeFixtureVideoLive() });
  let active = null;
  harness.transport.openLiveChatStream = async () => {
    active = controllableStream();
    return active.handle;
  };
  const provider = new YouTubeLiveChatProvider();
  provider.setIntegration(harness.transport);
  await provider.connect({ videoOrBroadcastId: "https://youtu.be/dQw4w9WgXcQ" });
  await flush();
  active.push(
    fixtures.youtubeFixtureChatPage({
      pollingIntervalMillis: 8000,
      nextPageToken: "cursor-1",
      messages: [],
    }),
  );
  await flush();
  active.push(
    fixtures.youtubeFixtureChatPage({
      pollingIntervalMillis: 8000,
      chatEnded: true,
      messages: [],
    }),
  );
  await flush();
  assert.match(provider.getStatus().detail, /chat has ended/);

  let opens = 0;
  harness.transport.openLiveChatStream = async () => {
    opens += 1;
    if (opens === 1) throw new YouTubeStreamError("disabled", "Live chat is disabled for this broadcast.");
    throw new YouTubeStreamError("ended", "YouTube live chat has ended.");
  };
  await provider.connect({ videoOrBroadcastId: "dQw4w9WgXcQ" });
  await flush();
  assert.match(provider.getStatus().detail, /disabled/);

  harness.setVideoBody(fixtures.youtubeFixtureVideoScheduled());
  const upcoming = await provider.connect({ videoOrBroadcastId: "dQw4w9WgXcQ" });
  assert.match(upcoming.detail, /not live yet/);

  harness.setVideoBody(fixtures.youtubeFixtureVideoEnded());
  const ended = await provider.connect({ videoOrBroadcastId: "dQw4w9WgXcQ" });
  assert.match(ended.detail, /ended/);

  harness.setVideoBody({ items: [] });
  const missing = await provider.connect({ videoOrBroadcastId: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  assert.match(missing.detail, /not found/);
});

test("YouTube streamList client definition loads without calling YouTube", async () => {
  const { youtubeStreamListDefinitionReady } = await importSrc(
    "src/integrations/youtube/youtube-live-chat-stream.ts",
  );
  assert.equal(await youtubeStreamListDefinitionReady(), true);
});
