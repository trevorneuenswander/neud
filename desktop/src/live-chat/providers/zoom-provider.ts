import type { ZoomIntegrationService } from "../../integrations/zoom/zoom-integration-service";
import {
  friendlyZoomMessage,
  mapZoomErrorCode,
  type ZoomFriendlyErrorCode,
  type ZoomSourceMode,
} from "../../integrations/zoom/zoom-types";
import type {
  LiveChatMessage,
  LiveChatProvider,
  LiveChatProviderStatus,
} from "../types";

let zoomMessageSeq = 0;
function newId(): string {
  zoomMessageSeq += 1;
  return `zoom-${Date.now()}-${zoomMessageSeq}`;
}

/**
 * Zoom Live Chat adapter (Pass 23).
 * Event-driven RTMS / Zoom API path (not browser automation).
 * Credentials come from machine-level ZoomIntegrationService (safeStorage).
 */
export class ZoomLiveChatProvider implements LiveChatProvider {
  readonly id = "zoom" as const;
  readonly label = "Zoom";
  readonly connectionRequirements = [
    "Connect Zoom (General App user OAuth)",
    "Meeting or Webinar ID",
    "Zoom RTMS enabled for the authorized account",
  ];

  private integration: ZoomIntegrationService | null = null;
  private status: LiveChatProviderStatus = {
    provider: "zoom",
    status: "disconnected",
    label: this.label,
    detail: null,
    lastError: null,
  };
  private listeners = new Set<(message: LiveChatMessage) => void>();
  private lastEventAt: string | null = null;
  private lastFriendlyCode: ZoomFriendlyErrorCode | null = null;
  private sessionActive = false;

  setIntegration(service: ZoomIntegrationService | null): void {
    this.integration = service;
  }

  async connect(settings: Record<string, unknown>): Promise<LiveChatProviderStatus> {
    this.status = {
      ...this.status,
      status: "connecting",
      detail: "Connecting to Zoom…",
      lastError: null,
    };
    this.lastFriendlyCode = null;

    const sourceMode: ZoomSourceMode =
      settings.sourceMode === "webinar" ? "webinar" : "meeting";
    const meetingId =
      typeof settings.meetingOrWebinarId === "string"
        ? settings.meetingOrWebinarId.trim()
        : "";

    const integration = this.integration;
    const zoomStatus = integration?.getPublicStatus();
    if (!integration || !zoomStatus?.appConfigured) {
      return this.setAuthRequired("APP_CREDENTIALS_REQUIRED", sourceMode, meetingId);
    }
    if (!zoomStatus.userConnected) {
      return this.setAuthRequired("AUTH_NOT_CONFIGURED", sourceMode, meetingId);
    }

    if (!meetingId) {
      this.status = {
        ...this.status,
        status: "error",
        detail: "Enter a Zoom Meeting or Webinar ID.",
        sourceMode,
        meetingOrBroadcastId: null,
        lastError: "Missing meeting/webinar identifier",
      };
      this.lastFriendlyCode = "MEETING_NOT_FOUND";
      return this.status;
    }

    const lookup = await integration.lookupMeetingOrWebinar({
      sourceMode,
      meetingOrWebinarId: meetingId,
    });
    if (!lookup.ok) {
      this.lastFriendlyCode = lookup.errorCode;
      this.status = {
        ...this.status,
        status:
          lookup.errorCode === "AUTH_NOT_CONFIGURED" ||
          lookup.errorCode === "AUTH_EXPIRED"
            ? "authentication_required"
            : "error",
        detail: friendlyZoomMessage(lookup.errorCode),
        sourceMode,
        meetingOrBroadcastId: meetingId,
        lastError: lookup.technical,
      };
      return this.status;
    }

    this.lastEventAt = new Date().toISOString();

    // Preferred live path: start RTMS for public/everyone chat (media_type chat).
    const rtms = await integration.startRtmsForLiveMeeting(lookup.id);
    this.lastEventAt = new Date().toISOString();

    if (!rtms.ok) {
      // Auth + meeting identity validated; RTMS enablement still required for chat.
      const code = rtms.errorCode ?? "RTMS_UNAVAILABLE";
      this.lastFriendlyCode = code;
      this.sessionActive = false;
      this.status = {
        ...this.status,
        status: "error",
        detail: friendlyZoomMessage(code),
        sourceMode,
        meetingOrBroadcastId: lookup.id,
        lastError: rtms.technical,
      };
      return this.status;
    }

    this.sessionActive = true;
    this.status = {
      ...this.status,
      status: "connected",
      detail: `Connected to Zoom ${sourceMode} “${lookup.topic || lookup.id}”. Listening for live chat…`,
      sourceMode,
      meetingOrBroadcastId: lookup.id,
      lastError: null,
    };
    return this.status;
  }

  async disconnect(): Promise<LiveChatProviderStatus> {
    this.sessionActive = false;
    this.status = {
      ...this.status,
      status: "disconnected",
      detail: null,
      lastError: null,
    };
    this.lastFriendlyCode = null;
    return this.status;
  }

  getStatus(): LiveChatProviderStatus {
    return { ...this.status };
  }

  getDiagnostics(): Record<string, unknown> {
    const publicStatus = this.integration?.getPublicStatus();
    return {
      zoomConfigured: publicStatus?.configured ?? false,
      authState: publicStatus?.authState ?? "not_configured",
      meetingOrWebinarMode: this.status.sourceMode ?? null,
      meetingOrWebinarId: this.status.meetingOrBroadcastId ?? null,
      providerSessionStatus: this.status.status,
      lastEventTime: this.lastEventAt,
      lastMessageTime: this.status.lastMessageAt ?? null,
      lastError: this.status.lastError,
      lastFriendlyCode: this.lastFriendlyCode,
      mechanism: "zoom-rtms-general-oauth-pkce",
      connectedAs: publicStatus?.connectedAs ?? null,
      appConfigured: publicStatus?.appConfigured ?? false,
      userConnected: publicStatus?.userConnected ?? false,
      // Explicitly never include secrets.
      accountId: undefined,
      clientSecret: undefined,
      accessToken: undefined,
      refreshToken: undefined,
    };
  }

  subscribeMessages(onMessage: (message: LiveChatMessage) => void): () => void {
    this.listeners.add(onMessage);
    return () => {
      this.listeners.delete(onMessage);
    };
  }

  /**
   * Ingest a Zoom chat frame (RTMS MEDIA_DATA_CHAT / event payload).
   * Called by the RTMS/event bridge — not by UI scraping.
   */
  ingestProviderMessage(input: {
    providerMessageId: string;
    authorName: string;
    text: string;
    authorId?: string;
    timestamp?: string;
    metadata?: Record<string, unknown>;
  }): LiveChatMessage | null {
    if (!this.sessionActive) {
      return null;
    }
    const text = input.text.trim();
    if (!text) return null;
    const message: LiveChatMessage = {
      id: newId(),
      provider: "zoom",
      providerMessageId: input.providerMessageId,
      timestamp: input.timestamp ?? new Date().toISOString(),
      authorId: input.authorId,
      authorName: input.authorName.trim() || "Zoom Participant",
      text,
      metadata: input.metadata,
    };
    this.status = {
      ...this.status,
      lastMessageAt: message.timestamp,
    };
    this.lastEventAt = message.timestamp;
    for (const listener of this.listeners) {
      listener(message);
    }
    return message;
  }

  private setAuthRequired(
    code: ZoomFriendlyErrorCode,
    sourceMode: ZoomSourceMode,
    meetingId: string,
  ): LiveChatProviderStatus {
    this.lastFriendlyCode = code;
    this.status = {
      ...this.status,
      status: "authentication_required",
      detail: friendlyZoomMessage(code),
      sourceMode,
      meetingOrBroadcastId: meetingId || null,
      lastError: mapZoomErrorCode({ code }).toString(),
    };
    // Keep technical code in lastError for diagnostics; operator sees detail.
    this.status.lastError = code;
    return this.status;
  }
}
