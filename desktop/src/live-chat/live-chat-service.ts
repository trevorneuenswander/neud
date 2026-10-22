import fs from "fs";
import path from "path";
import type { AppPaths } from "../services/app-paths";
import type { DisplayBridgeEvents } from "../displays/display-bridge-events";
import type { ZoomIntegrationService } from "../integrations/zoom/zoom-integration-service";
import {
  createLiveChatProvider,
  isLiveChatProviderId,
  LIVE_CHAT_PROVIDER_CATALOG,
} from "./providers/registry";
import { parseYouTubeVideoId } from "./providers/youtube-video-id.ts";
import type { YouTubeLiveChatTransport } from "./providers/youtube-live-api.ts";
import { ingestLiveChatMessage } from "./live-chat-ingest";
import { ManualLiveChatProvider } from "./providers/manual-provider";
import { YouTubeLiveChatProvider } from "./providers/youtube-provider";
import { ZoomLiveChatProvider } from "./providers/zoom-provider";
import type {
  LiveChatCanonicalState,
  LiveChatMessage,
  LiveChatMode,
  LiveChatProjectConfig,
  LiveChatProvider,
  LiveChatProviderId,
} from "./types";

const MAX_APPROVED = 100;

type ActivityRecorder = (input: {
  type: string;
  message: string;
  userAction?: string;
  metadata?: Record<string, unknown>;
}) => void;

type ProjectSession = {
  projectId: string;
  config: LiveChatProjectConfig;
  provider: LiveChatProvider;
  unsubscribe: (() => void) | null;
  incoming: LiveChatMessage[];
  approved: LiveChatMessage[];
  current: LiveChatMessage | null;
  rejectedCount: number;
  receivedCount: number;
  approvedCount: number;
};

function defaultConfig(): LiveChatProjectConfig {
  return {
    provider: "manual",
    mode: "automatic",
    providerSettings: {},
  };
}

function configPath(paths: AppPaths, projectId: string): string {
  return path.join(paths.projects, projectId, "live-chat", "config.json");
}

export class LiveChatService {
  private sessions = new Map<string, ProjectSession>();
  private displayBridgeEvents: DisplayBridgeEvents | null = null;
  private activityRecorder: ActivityRecorder | null = null;
  private hydrationHandler:
    | ((projectId: string) => void)
    | null = null;
  private displayRevision = new Map<string, number>();
  private zoomIntegration: ZoomIntegrationService | null = null;
  private youtubeTransport: YouTubeLiveChatTransport | null = null;
  private lastProviderWarning = new Map<string, string>();

  constructor(private readonly paths: AppPaths) {}

  setZoomIntegration(service: ZoomIntegrationService | null): void {
    this.zoomIntegration = service;
    for (const session of this.sessions.values()) {
      this.bindZoomIntegration(session.provider);
    }
  }

  setYouTubeIntegration(transport: YouTubeLiveChatTransport | null): void {
    this.youtubeTransport = transport;
    for (const session of this.sessions.values()) {
      this.bindYouTubeIntegration(session.provider);
    }
  }

  private bindZoomIntegration(provider: LiveChatProvider): void {
    if (provider instanceof ZoomLiveChatProvider) {
      provider.setIntegration(this.zoomIntegration);
    }
  }

  private bindYouTubeIntegration(provider: LiveChatProvider): void {
    if (!(provider instanceof YouTubeLiveChatProvider)) {
      return;
    }
    provider.setIntegration(this.youtubeTransport);
    provider.setStatusListener((status) => {
      const session = [...this.sessions.values()].find(
        (entry) => entry.provider === provider,
      );
      if (!session) return;
      if (status.status === "connected") {
        this.lastProviderWarning.delete(session.projectId);
        return;
      }
      if (status.status === "error" || status.status === "authentication_required") {
        const detail = status.detail || status.lastError;
        if (detail) this.noteProviderWarning(session, detail);
      }
    });
  }

  private noteProviderWarning(session: ProjectSession, detail: string): void {
    const key = `${session.projectId}:${detail}`;
    if (this.lastProviderWarning.get(session.projectId) === key) {
      return;
    }
    this.lastProviderWarning.set(session.projectId, key);
    this.safeRecordActivity({
      type: "system.warning",
      message: `YouTube Live: ${detail}`,
      userAction: `YouTube Live: ${detail}`,
      metadata: { projectId: session.projectId, provider: "youtube-live" },
    });
  }

  setDisplayBridgeEvents(events: DisplayBridgeEvents): void {
    this.displayBridgeEvents = events;
  }

  setActivityRecorder(recorder: ActivityRecorder): void {
    this.activityRecorder = recorder;
  }

  setHydrationHandler(handler: (projectId: string) => void): void {
    this.hydrationHandler = handler;
  }

  listProviders() {
    return LIVE_CHAT_PROVIDER_CATALOG;
  }

  ensureProjectBootstrap(projectId: string): void {
    this.getOrCreateSession(projectId);
    this.hydrationHandler?.(projectId);
  }

  getState(projectId: string): LiveChatCanonicalState {
    const session = this.getOrCreateSession(projectId);
    return this.toCanonical(session);
  }

  getDisplayPayload(projectId: string): {
    current: LiveChatMessage | null;
    visible: boolean;
  } {
    const session = this.getOrCreateSession(projectId);
    return {
      current: session.current,
      visible: Boolean(session.current),
    };
  }

  async selectProvider(
    projectId: string,
    providerId: LiveChatProviderId,
  ): Promise<LiveChatCanonicalState> {
    const session = this.getOrCreateSession(projectId);
    const status = session.provider.getStatus().status;
    if (status === "connected" || status === "connecting") {
      throw new Error("Disconnect the current provider before changing providers.");
    }
    if (session.unsubscribe) {
      session.unsubscribe();
      session.unsubscribe = null;
    }
    session.config.provider = providerId;
    session.provider = createLiveChatProvider(providerId);
    this.bindZoomIntegration(session.provider);
    this.bindYouTubeIntegration(session.provider);
    this.persistConfig(session);
    return this.toCanonical(session);
  }

  async setMode(projectId: string, mode: LiveChatMode): Promise<LiveChatCanonicalState> {
    const session = this.getOrCreateSession(projectId);
    if (session.config.mode !== mode) {
      session.config.mode = mode;
      this.persistConfig(session);
      this.safeRecordActivity({
        type: "live-chat.mode_changed",
        message: `Live Chat mode changed to ${mode === "producer" ? "Producer" : "Automatic"}`,
        userAction: `Live Chat mode changed to ${mode === "producer" ? "Producer" : "Automatic"}`,
        metadata: { projectId, mode },
      });
    }
    return this.toCanonical(session);
  }

  async connect(
    projectId: string,
    settings?: Record<string, unknown>,
  ): Promise<LiveChatCanonicalState> {
    const session = this.getOrCreateSession(projectId);
    if (settings && session.config.provider === "youtube-live") {
      const raw =
        typeof settings.videoOrBroadcastId === "string"
          ? settings.videoOrBroadcastId.trim()
          : "";
      if (raw) {
        const parsed = parseYouTubeVideoId(raw);
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }
        settings = { ...settings, videoOrBroadcastId: parsed.videoId };
      }
    }
    const previousVideo =
      session.config.provider === "youtube-live"
        ? String(session.config.providerSettings.videoOrBroadcastId ?? "").trim()
        : "";
    if (settings) {
      session.config.providerSettings = {
        ...session.config.providerSettings,
        ...settings,
      };
      this.persistConfig(session);
    }
    const nextVideo =
      session.config.provider === "youtube-live"
        ? String(session.config.providerSettings.videoOrBroadcastId ?? "").trim()
        : "";
    if (
      session.config.provider === "youtube-live" &&
      previousVideo &&
      nextVideo &&
      previousVideo !== nextVideo
    ) {
      session.incoming = [];
      if (session.current?.provider === "youtube-live") {
        session.current = null;
      }
      this.safeRecordActivity({
        type: "system.info",
        message: `YouTube live source changed to ${nextVideo}`,
        userAction: `YouTube live source changed to ${nextVideo}`,
        metadata: { projectId, provider: "youtube-live", videoId: nextVideo },
      });
    }
    if (session.unsubscribe) {
      session.unsubscribe();
    }
    session.unsubscribe = session.provider.subscribeMessages((message) => {
      this.handleIncoming(session, message);
    });
    const connection = await session.provider.connect(session.config.providerSettings);
    if (connection.status === "connected") {
      const label = session.provider.label;
      this.safeRecordActivity({
        type: "live-chat.connected",
        message: `Live Chat connected to ${label}`,
        userAction: `Live Chat connected to ${label}`,
        metadata: { projectId, provider: session.config.provider },
      });
      if (session.config.provider === "youtube-live") {
        session.config.providerSettings = {
          ...session.config.providerSettings,
          resumeConnection: true,
        };
        this.persistConfig(session);
      }
    } else if (
      session.config.provider === "youtube-live" &&
      (connection.detail || connection.lastError)
    ) {
      this.noteProviderWarning(
        session,
        connection.detail || connection.lastError || "YouTube Live error",
      );
    }
    this.publishDisplay(session);
    return this.toCanonical(session);
  }

  async disconnect(projectId: string): Promise<LiveChatCanonicalState> {
    const session = this.getOrCreateSession(projectId);
    const label = session.provider.label;
    if (session.unsubscribe) {
      session.unsubscribe();
      session.unsubscribe = null;
    }
    await session.provider.disconnect();
    if (session.config.provider === "youtube-live") {
      session.config.providerSettings = {
        ...session.config.providerSettings,
        resumeConnection: false,
      };
      this.persistConfig(session);
    }
    this.safeRecordActivity({
      type: "live-chat.disconnected",
      message: `Live Chat disconnected from ${label}`,
      userAction: `Live Chat disconnected from ${label}`,
      metadata: { projectId, provider: session.config.provider },
    });
    // Keep current on-air message — do not clear on disconnect.
    this.publishDisplay(session);
    return this.toCanonical(session);
  }

  /** Activity failures must never block Live Chat state transitions. */
  private safeRecordActivity(input: {
    type: string;
    message: string;
    userAction?: string;
    metadata?: Record<string, unknown>;
  }): void {
    try {
      this.activityRecorder?.(input);
    } catch {
      // Ignore Activity logging failures.
    }
  }

  submitManualMessage(
    projectId: string,
    input: { authorName: string; text: string },
  ): LiveChatCanonicalState {
    const session = this.getOrCreateSession(projectId);
    if (session.config.provider !== "manual") {
      throw new Error("Manual messages require the Manual / Test provider.");
    }
    const manual = session.provider as ManualLiveChatProvider;
    manual.submit(input);
    return this.toCanonical(session);
  }

  takeMessage(projectId: string, messageId: string): LiveChatCanonicalState {
    const session = this.getOrCreateSession(projectId);
    const message = session.incoming.find((entry) => entry.id === messageId);
    if (!message) {
      throw new Error("Message not found in review queue.");
    }
    session.incoming = session.incoming.filter((entry) => entry.id !== messageId);
    session.approved = [message, ...session.approved].slice(0, MAX_APPROVED);
    session.current = message;
    session.approvedCount += 1;
    this.publishDisplay(session);
    return this.toCanonical(session);
  }

  skipMessage(projectId: string, messageId: string): LiveChatCanonicalState {
    const session = this.getOrCreateSession(projectId);
    const before = session.incoming.length;
    session.incoming = session.incoming.filter((entry) => entry.id !== messageId);
    if (session.incoming.length < before) {
      session.rejectedCount += 1;
    }
    return this.toCanonical(session);
  }

  clearQueue(projectId: string): LiveChatCanonicalState {
    const session = this.getOrCreateSession(projectId);
    session.rejectedCount += session.incoming.length;
    session.incoming = [];
    return this.toCanonical(session);
  }

  hideCurrent(projectId: string): LiveChatCanonicalState {
    const session = this.getOrCreateSession(projectId);
    session.current = null;
    this.publishDisplay(session);
    return this.toCanonical(session);
  }

  private handleIncoming(session: ProjectSession, message: LiveChatMessage): void {
    if (ingestLiveChatMessage(session, message)) {
      this.publishDisplay(session);
    }
  }

  private publishDisplay(session: ProjectSession): void {
    const revision = (this.displayRevision.get(session.projectId) ?? 0) + 1;
    this.displayRevision.set(session.projectId, revision);
    const contentHash = session.current
      ? `live-chat:${session.current.id}:${revision}`
      : `live-chat:empty:${revision}`;
    this.displayBridgeEvents?.publishDisplayDataChanged(session.projectId, {
      revision,
      contentHash,
      emittedAtMs: Date.now(),
    });
  }

  private getOrCreateSession(projectId: string): ProjectSession {
    const existing = this.sessions.get(projectId);
    if (existing) {
      return existing;
    }
    const config = this.loadConfig(projectId);
    const provider = createLiveChatProvider(config.provider);
    this.bindZoomIntegration(provider);
    this.bindYouTubeIntegration(provider);
    const session: ProjectSession = {
      projectId,
      config,
      provider,
      unsubscribe: null,
      incoming: [],
      approved: [],
      current: null,
      rejectedCount: 0,
      receivedCount: 0,
      approvedCount: 0,
    };
    this.sessions.set(projectId, session);
    if (
      config.provider === "youtube-live" &&
      config.providerSettings.resumeConnection === true
    ) {
      queueMicrotask(() => {
        void this.connect(projectId).catch(() => {});
      });
    }
    return session;
  }

  private loadConfig(projectId: string): LiveChatProjectConfig {
    const file = configPath(this.paths, projectId);
    try {
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<LiveChatProjectConfig>;
        const provider =
          typeof raw.provider === "string" && isLiveChatProviderId(raw.provider)
            ? raw.provider
            : "manual";
        const mode = raw.mode === "producer" ? "producer" : "automatic";
        return {
          provider,
          mode,
          providerSettings:
            raw.providerSettings && typeof raw.providerSettings === "object"
              ? (raw.providerSettings as Record<string, unknown>)
              : {},
        };
      }
    } catch {
      // fall through to default
    }
    return defaultConfig();
  }

  private persistConfig(session: ProjectSession): void {
    const file = configPath(this.paths, session.projectId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Never persist secrets — only non-secret settings.
    const safeSettings = { ...session.config.providerSettings };
    for (const key of Object.keys(safeSettings)) {
      if (/token|secret|password|key/i.test(key)) {
        delete safeSettings[key];
      }
    }
    fs.writeFileSync(
      file,
      `${JSON.stringify(
        {
          provider: session.config.provider,
          mode: session.config.mode,
          providerSettings: safeSettings,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  private toCanonical(session: ProjectSession): LiveChatCanonicalState {
    const connection = session.provider.getStatus();
    const settings = session.config.providerSettings;
    const persistedMeetingId =
      typeof settings.meetingOrWebinarId === "string"
        ? settings.meetingOrWebinarId
        : null;
    const persistedVideoId =
      session.config.provider === "youtube-live" &&
      typeof settings.videoOrBroadcastId === "string"
        ? settings.videoOrBroadcastId
        : null;
    const persistedSourceMode =
      settings.sourceMode === "webinar" || settings.sourceMode === "meeting"
        ? settings.sourceMode
        : null;
    const enrichedConnection = {
      ...connection,
      meetingOrBroadcastId:
        connection.meetingOrBroadcastId ?? persistedVideoId ?? persistedMeetingId,
      sourceMode: connection.sourceMode ?? persistedSourceMode,
    };
    const providerDetails =
      session.provider instanceof ZoomLiveChatProvider
        ? session.provider.getDiagnostics()
        : session.provider instanceof YouTubeLiveChatProvider
          ? session.provider.getDiagnostics()
        : session.config.provider === "zoom"
          ? {
              zoomConfigured:
                this.zoomIntegration?.getPublicStatus().configured ?? false,
              authState:
                this.zoomIntegration?.getPublicStatus().authState ??
                "not_configured",
            }
          : null;
    return {
      projectId: session.projectId,
      provider: session.config.provider,
      mode: session.config.mode,
      connection: enrichedConnection,
      incoming: session.incoming,
      approved: session.approved,
      current: session.current,
      rejectedCount: session.rejectedCount,
      receivedCount: session.receivedCount,
      approvedCount: session.approvedCount,
      diagnostics: {
        provider: session.config.provider,
        connectionStatus: connection.status,
        lastMessageTimestamp: connection.lastMessageAt ?? null,
        receivedCount: session.receivedCount,
        approvedCount: session.approvedCount,
        rejectedCount: session.rejectedCount,
        currentMessageId: session.current?.id ?? null,
        lastProviderError: connection.lastError ?? null,
        providerDetails,
      },
    };
  }
}
