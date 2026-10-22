import { localFetch } from "@/lib/local/api";

export type LiveChatProviderId =
  | "manual"
  | "zoom"
  | "youtube-live"
  | "facebook-live";

export type LiveChatMode = "automatic" | "producer";

export type LiveChatMessage = {
  id: string;
  provider: LiveChatProviderId;
  providerMessageId: string;
  timestamp: string;
  authorId?: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  metadata?: Record<string, unknown>;
  deleted?: boolean;
};

export type LiveChatState = {
  projectId: string;
  provider: LiveChatProviderId;
  mode: LiveChatMode;
  connection: {
    provider: LiveChatProviderId;
    status: string;
    label: string;
    detail?: string | null;
    meetingOrBroadcastId?: string | null;
    sourceMode?: string | null;
    lastMessageAt?: string | null;
    lastError?: string | null;
  };
  incoming: LiveChatMessage[];
  approved: LiveChatMessage[];
  current: LiveChatMessage | null;
  diagnostics: {
    provider: LiveChatProviderId;
    connectionStatus: string;
    lastMessageTimestamp: string | null;
    receivedCount: number;
    approvedCount: number;
    rejectedCount: number;
    currentMessageId: string | null;
    lastProviderError: string | null;
    providerDetails?: Record<string, unknown> | null;
  };
};

export type YouTubeLiveChatPublicStatus = {
  configured: boolean;
  userConnected: boolean;
  authState:
    | "not_configured"
    | "configured"
    | "connected"
    | "expired"
    | "revoked"
    | "error"
    | "pending"
    | "cancelled"
    | "timed_out"
    | "denied"
    | "exchange_failed";
  connectedAs: string | null;
  clientIdMasked: string | null;
  clientSecretConfigured?: boolean;
  lastError: string | null;
  friendlyMessage: string;
  secureStorage: boolean;
};

export type ZoomLiveChatPublicStatus = {
  appConfigured: boolean;
  userConnected: boolean;
  configured: boolean;
  authState: string;
  connectedAs: string | null;
  publicClientIdMasked?: string | null;
  clientIdMasked: string | null;
  oauthMode?: "development" | "production";
  developmentConfigured?: boolean;
  productionConfigured?: boolean;
  accountIdMasked: null;
  lastValidatedAt: string | null;
  lastErrorCode: string | null;
  lastError: string | null;
  friendlyMessage: string;
  mechanism: string;
  oauthRedirectUri?: string;
};

function base(slug: string) {
  return `/api/projects/${encodeURIComponent(slug)}/live-chat`;
}

export async function localGetLiveChatState(projectSlug: string) {
  return localFetch<{
    state: LiveChatState;
    providers: Array<{ id: LiveChatProviderId; label: string }>;
    zoom?: ZoomLiveChatPublicStatus | null;
    youtube?: YouTubeLiveChatPublicStatus | null;
  }>(base(projectSlug));
}

export async function localLiveChatSelectProvider(
  projectSlug: string,
  provider: LiveChatProviderId,
) {
  return localFetch<{ state: LiveChatState }>(`${base(projectSlug)}/select-provider`, {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
}

export async function localLiveChatSetMode(
  projectSlug: string,
  mode: LiveChatMode,
) {
  return localFetch<{ state: LiveChatState }>(`${base(projectSlug)}/mode`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export async function localLiveChatConnect(
  projectSlug: string,
  settings?: Record<string, unknown>,
) {
  return localFetch<{ state: LiveChatState }>(`${base(projectSlug)}/connect`, {
    method: "POST",
    body: JSON.stringify({ settings: settings ?? {} }),
  });
}

export async function localLiveChatDisconnect(projectSlug: string) {
  return localFetch<{ state: LiveChatState }>(`${base(projectSlug)}/disconnect`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function localLiveChatManualMessage(
  projectSlug: string,
  input: { authorName: string; text: string },
) {
  return localFetch<{ state: LiveChatState }>(`${base(projectSlug)}/manual-message`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function localLiveChatTake(projectSlug: string, messageId: string) {
  return localFetch<{ state: LiveChatState }>(`${base(projectSlug)}/take`, {
    method: "POST",
    body: JSON.stringify({ messageId }),
  });
}

export async function localLiveChatSkip(projectSlug: string, messageId: string) {
  return localFetch<{ state: LiveChatState }>(`${base(projectSlug)}/skip`, {
    method: "POST",
    body: JSON.stringify({ messageId }),
  });
}

export async function localLiveChatHideCurrent(projectSlug: string) {
  return localFetch<{ state: LiveChatState }>(`${base(projectSlug)}/hide-current`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function localLiveChatClearQueue(projectSlug: string) {
  return localFetch<{ state: LiveChatState }>(`${base(projectSlug)}/clear-queue`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
