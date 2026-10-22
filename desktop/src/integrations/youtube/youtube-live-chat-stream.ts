import fs from "fs";
import os from "os";
import path from "path";
import {
  YouTubeStreamError,
  type YouTubeLiveChatStream,
} from "../../live-chat/providers/youtube-live-api.ts";

/**
 * Official stream_list.proto field numbers from
 * https://developers.google.com/youtube/v3/live/streaming-live-chat
 * Server-streaming RPC: youtube.googleapis.com:443
 * V3DataLiveChatMessageService.StreamList
 */
const STREAM_LIST_PROTO = `syntax = "proto2";
package youtube.api.v3;

service V3DataLiveChatMessageService {
  rpc StreamList(LiveChatMessageListRequest)
      returns (stream LiveChatMessageListResponse) {}
}

message LiveChatMessageListRequest {
  optional string live_chat_id = 1;
  optional string hl = 2;
  optional uint32 profile_image_size = 3;
  optional uint32 max_results = 98;
  optional string page_token = 99;
  repeated string part = 100;
}

message LiveChatMessageListResponse {
  optional string kind = 200;
  optional string etag = 201;
  optional string offline_at = 2;
  optional PageInfo page_info = 1004;
  optional string next_page_token = 100602;
  repeated LiveChatMessage items = 1007;
}

message LiveChatMessage {
  optional string kind = 200;
  optional string etag = 201;
  optional string id = 101;
  optional LiveChatMessageSnippet snippet = 2;
  optional LiveChatMessageAuthorDetails author_details = 3;
}

message LiveChatMessageAuthorDetails {
  optional string channel_id = 10101;
  optional string channel_url = 102;
  optional string display_name = 103;
  optional string profile_image_url = 104;
}

message LiveChatMessageSnippet {
  enum Type {
    INVALID_TYPE = 0;
    TEXT_MESSAGE_EVENT = 1;
    TOMBSTONE = 2;
    FAN_FUNDING_EVENT = 3;
    CHAT_ENDED_EVENT = 4;
    SPONSOR_ONLY_MODE_STARTED_EVENT = 5;
    SPONSOR_ONLY_MODE_ENDED_EVENT = 6;
    NEW_SPONSOR_EVENT = 7;
    USER_BANNED_EVENT = 10;
    SUPER_CHAT_EVENT = 15;
    SUPER_STICKER_EVENT = 16;
    MEMBER_MILESTONE_CHAT_EVENT = 17;
    MEMBERSHIP_GIFTING_EVENT = 18;
    GIFT_MEMBERSHIP_RECEIVED_EVENT = 19;
    POLL_EVENT = 20;
    GIFT_EVENT = 21;
  }
  optional Type type = 1;
  optional string live_chat_id = 201;
  optional string author_channel_id = 301;
  optional string published_at = 4;
  optional bool has_display_content = 17;
  optional string display_message = 16;
  optional LiveChatTextMessageDetails text_message_details = 19;
}

message LiveChatTextMessageDetails {
  optional string message_text = 1;
}

message PageInfo {
  optional int32 total_results = 1;
  optional int32 results_per_page = 2;
}
`;

type GrpcModule = typeof import("@grpc/grpc-js");
type ServiceConstructor = new (
  address: string,
  credentials: ReturnType<GrpcModule["credentials"]["createSsl"]>,
) => {
  streamList: (
    request: Record<string, unknown>,
    metadata: InstanceType<GrpcModule["Metadata"]>,
  ) => NodeJS.EventEmitter & { cancel(): void };
  close(): void;
};

let serviceConstructor: ServiceConstructor | null = null;

function protoPath(): string {
  const file = path.join(os.tmpdir(), "neud-youtube-stream-list.proto");
  fs.writeFileSync(file, STREAM_LIST_PROTO);
  return file;
}

async function loadService(grpc: GrpcModule): Promise<ServiceConstructor> {
  if (serviceConstructor) return serviceConstructor;
  const protoLoader = await import("@grpc/proto-loader");
  const definition = protoLoader.loadSync(protoPath(), {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(definition) as unknown as {
    youtube: { api: { v3: { V3DataLiveChatMessageService: ServiceConstructor } } };
  };
  serviceConstructor = loaded.youtube.api.v3.V3DataLiveChatMessageService;
  return serviceConstructor;
}

export async function youtubeStreamListDefinitionReady(): Promise<boolean> {
  const grpc = await import("@grpc/grpc-js");
  const Service = await loadService(grpc);
  const described = Service as unknown as { service?: Record<string, unknown> };
  return Boolean(described.service?.StreamList || described.service?.streamList);
}

function mapGrpcError(error: unknown): YouTubeStreamError {
  const record = error as { code?: number; message?: string; details?: string };
  const text = `${record.message ?? ""} ${record.details ?? ""}`;
  const code = record.code;
  if (code === 16 || /unauthenticated|invalid_grant/i.test(text)) {
    return new YouTubeStreamError(
      "unauthorized",
      "YouTube authorization expired or was revoked. Connect the YouTube account again.",
    );
  }
  if (/LIVE_CHAT_ENDED|liveChatEnded/i.test(text)) {
    return new YouTubeStreamError("ended", "YouTube live chat has ended.");
  }
  if (/LIVE_CHAT_DISABLED|liveChatDisabled/i.test(text)) {
    return new YouTubeStreamError("disabled", "Live chat is disabled for this broadcast.");
  }
  if (code === 7 || code === 9) {
    return new YouTubeStreamError("forbidden", "YouTube denied access to this live chat.");
  }
  if (code === 8 || /quota|RESOURCE_EXHAUSTED|rateLimit/i.test(text)) {
    return new YouTubeStreamError("quota", "YouTube API quota or rate limit was reached. NEUD will retry.");
  }
  if (code === 3) {
    return new YouTubeStreamError("malformed", "YouTube returned a live chat response NEUD could not read.");
  }
  return new YouTubeStreamError("unavailable", "YouTube live chat connection closed. NEUD will retry.");
}

/**
 * Open YouTube's server-streaming liveChatMessages.streamList RPC.
 * Authorization is metadata only. The token is not logged.
 */
export async function openYouTubeLiveChatStream(input: {
  liveChatId: string;
  pageToken: string | null;
  accessToken: string;
}): Promise<YouTubeLiveChatStream> {
  const grpc = await import("@grpc/grpc-js");
  const Service = await loadService(grpc);
  const client = new Service("youtube.googleapis.com:443", grpc.credentials.createSsl());
  const metadata = new grpc.Metadata();
  metadata.set("authorization", `Bearer ${input.accessToken}`);
  const request: Record<string, unknown> = {
    liveChatId: input.liveChatId,
    part: ["id", "snippet", "authorDetails"],
  };
  if (input.pageToken) {
    request.pageToken = input.pageToken;
  }
  const call = client.streamList(request, metadata);

  const queue: unknown[] = [];
  let finished = false;
  let failure: YouTubeStreamError | null = null;
  let wake: (() => void) | null = null;

  const notify = () => {
    const current = wake;
    wake = null;
    current?.();
  };

  call.on("data", (row: unknown) => {
    queue.push(row);
    notify();
  });
  call.on("end", () => {
    finished = true;
    notify();
  });
  call.on("error", (error: unknown) => {
    failure = mapGrpcError(error);
    finished = true;
    notify();
  });

  const responses: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          while (queue.length === 0 && !finished) {
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          }
          if (queue.length > 0) {
            return { done: false, value: queue.shift() };
          }
          if (failure) throw failure;
          return { done: true, value: undefined };
        },
      };
    },
  };

  return {
    responses,
    close() {
      call.cancel();
      client.close();
    },
  };
}
