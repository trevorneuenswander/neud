export type LiveChatProviderId =
  | "manual"
  | "zoom"
  | "youtube-live"
  | "facebook-live";

export type LiveChatConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "authentication_required";

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
};

export type LiveChatProviderStatus = {
  provider: LiveChatProviderId;
  status: LiveChatConnectionStatus;
  label: string;
  detail?: string | null;
  meetingOrBroadcastId?: string | null;
  sourceMode?: string | null;
  lastMessageAt?: string | null;
  lastError?: string | null;
};

export type LiveChatCanonicalState = {
  projectId: string;
  provider: LiveChatProviderId;
  mode: LiveChatMode;
  connection: LiveChatProviderStatus;
  incoming: LiveChatMessage[];
  approved: LiveChatMessage[];
  current: LiveChatMessage | null;
  rejectedCount: number;
  receivedCount: number;
  approvedCount: number;
  diagnostics: {
    provider: LiveChatProviderId;
    connectionStatus: LiveChatConnectionStatus;
    lastMessageTimestamp: string | null;
    receivedCount: number;
    approvedCount: number;
    rejectedCount: number;
    currentMessageId: string | null;
    lastProviderError: string | null;
    /** Provider-specific public diagnostics (no secrets). */
    providerDetails?: Record<string, unknown> | null;
  };
};

export type LiveChatProjectConfig = {
  provider: LiveChatProviderId;
  mode: LiveChatMode;
  /** Non-secret provider settings only */
  providerSettings: Record<string, unknown>;
};

export interface LiveChatProvider {
  id: LiveChatProviderId;
  label: string;
  connectionRequirements: string[];
  connect(settings: Record<string, unknown>): Promise<LiveChatProviderStatus>;
  disconnect(): Promise<LiveChatProviderStatus>;
  getStatus(): LiveChatProviderStatus;
  subscribeMessages(
    onMessage: (message: LiveChatMessage) => void,
  ): () => void;
}
