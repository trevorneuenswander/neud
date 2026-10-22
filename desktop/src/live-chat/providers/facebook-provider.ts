import type {
  LiveChatMessage,
  LiveChatProvider,
  LiveChatProviderStatus,
} from "../types";

/** Facebook Live comments — official API only; no scraping. */
export class FacebookLiveChatProvider implements LiveChatProvider {
  readonly id = "facebook-live" as const;
  readonly label = "Facebook Live";
  readonly connectionRequirements = [
    "Facebook Graph API credentials",
    "Live video identity",
  ];

  private status: LiveChatProviderStatus = {
    provider: "facebook-live",
    status: "disconnected",
    label: this.label,
    detail: null,
    lastError: null,
  };
  private listeners = new Set<(message: LiveChatMessage) => void>();

  async connect(settings: Record<string, unknown>): Promise<LiveChatProviderStatus> {
    const liveVideoId =
      typeof settings.liveVideoId === "string" ? settings.liveVideoId.trim() : "";

    const hasApp =
      typeof process.env.NEUD_FACEBOOK_APP_ID === "string" &&
      process.env.NEUD_FACEBOOK_APP_ID.trim().length > 0;

    if (!hasApp) {
      this.status = {
        ...this.status,
        status: "authentication_required",
        detail: "Facebook Live credentials are not configured.",
        meetingOrBroadcastId: liveVideoId || null,
        lastError: "Authentication Required",
      };
      return this.status;
    }

    this.status = {
      ...this.status,
      status: "authentication_required",
      detail:
        "Facebook connector architecture is ready; complete secure auth before connecting.",
      meetingOrBroadcastId: liveVideoId || null,
      lastError: "Authentication Required",
    };
    return this.status;
  }

  async disconnect(): Promise<LiveChatProviderStatus> {
    this.status = {
      ...this.status,
      status: "disconnected",
      detail: null,
      lastError: null,
    };
    return this.status;
  }

  getStatus(): LiveChatProviderStatus {
    return { ...this.status };
  }

  subscribeMessages(onMessage: (message: LiveChatMessage) => void): () => void {
    this.listeners.add(onMessage);
    return () => {
      this.listeners.delete(onMessage);
    };
  }
}
