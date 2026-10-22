import { EventEmitter } from "node:events";
import type { VideoMediaStore } from "../video-media-store";
import {
  loadNativeVideoAddon,
  type NativeVideoAddon,
  type NativeVideoFrame,
  type NativeVideoMediaInfo,
} from "./native-video-addon";

export type VideoPlaybackState =
  | "idle"
  | "opened"
  | "playing"
  | "paused"
  | "stopped"
  | "ended"
  | "error";

export type VideoPlaybackSessionView = {
  displayId: string;
  projectId: string;
  mediaAssetId: string;
  state: VideoPlaybackState;
  loop: boolean;
  error: string | null;
  info: NativeVideoMediaInfo | null;
  hasFrame: boolean;
  ptsUs: number;
};

type InternalSession = {
  displayId: string;
  projectId: string;
  mediaAssetId: string;
  nativeSessionId: string;
  loop: boolean;
  state: VideoPlaybackState;
  error: string | null;
  info: NativeVideoMediaInfo | null;
  latestFrame: NativeVideoFrame | null;
};

/**
 * Owns native ProRes decoder sessions for project-video displays.
 * Transient playback state stays local — loop preference is persisted via VideoMediaStore.
 */
export class VideoPlaybackService extends EventEmitter {
  private readonly sessions = new Map<string, InternalSession>();
  private addon: NativeVideoAddon | null = null;

  constructor(private readonly media: VideoMediaStore) {
    super();
    this.addon = loadNativeVideoAddon();
  }

  platform() {
    return this.addon?.platform() ?? { decoder: "unavailable", available: false };
  }

  listSessions(): VideoPlaybackSessionView[] {
    return [...this.sessions.values()].map((session) => this.toView(session));
  }

  getSession(displayId: string): VideoPlaybackSessionView | null {
    const session = this.sessions.get(displayId);
    return session ? this.toView(session) : null;
  }

  getLatestFrame(displayId: string): NativeVideoFrame | null {
    return this.sessions.get(displayId)?.latestFrame ?? null;
  }

  async ensureOpen(displayId: string): Promise<VideoPlaybackSessionView> {
    const existing = this.sessions.get(displayId);
    if (existing) return this.toView(existing);

    if (!this.addon) {
      throw new Error("Native video decoder addon is not available.");
    }
    const asset = this.media.getByDisplayId(displayId);
    if (!asset) {
      throw new Error("Video media asset was not found for this display.");
    }
    const absolutePath = this.media.absolutePathFor(asset.relativePath);
    const opened = this.addon.open(absolutePath);
    if (!opened.ok) {
      throw new Error(opened.error);
    }

    const session: InternalSession = {
      displayId,
      projectId: asset.projectId,
      mediaAssetId: asset.id,
      nativeSessionId: opened.sessionId,
      loop: asset.loopEnabled,
      state: "opened",
      error: null,
      info: opened.info,
      latestFrame: null,
    };
    this.sessions.set(displayId, session);
    this.addon.setLoop(opened.sessionId, asset.loopEnabled);
    this.addon.onFrame(opened.sessionId, (frame) => {
      const current = this.sessions.get(displayId);
      if (!current) return;
      current.latestFrame = frame;
      this.emit("frame", displayId, frame);
    });
    this.addon.onState(opened.sessionId, (payload) => {
      const current = this.sessions.get(displayId);
      if (!current) return;
      current.state = normalizeState(payload.state);
      current.error = payload.error || null;
      this.emit("state", displayId, this.toView(current));
    });

    // Seed first frame for thumbnail/preview.
    const first = this.addon.pullFrame(opened.sessionId);
    if (first) {
      session.latestFrame = first;
      this.emit("frame", displayId, first);
    }
    this.emit("state", displayId, this.toView(session));
    return this.toView(session);
  }

  async play(displayId: string): Promise<VideoPlaybackSessionView> {
    const session = await this.ensureOpen(displayId);
    this.addon?.play(this.requireNativeId(displayId));
    return this.getSession(displayId) ?? session;
  }

  async pause(displayId: string): Promise<VideoPlaybackSessionView> {
    await this.ensureOpen(displayId);
    this.addon?.pause(this.requireNativeId(displayId));
    return this.requireView(displayId);
  }

  async stop(displayId: string): Promise<VideoPlaybackSessionView> {
    console.info("[video-playback] stop: request", { displayId });
    await this.ensureOpen(displayId);
    const nativeId = this.requireNativeId(displayId);
    console.info("[video-playback] stop: dispatch native", { displayId, nativeId });
    const startedAt = Date.now();
    this.addon?.stop(nativeId);
    const elapsedMs = Date.now() - startedAt;
    const internal = this.sessions.get(displayId);
    if (internal) {
      const status = this.addon?.getStatus(nativeId);
      internal.state = normalizeState(status?.state ?? "stopped");
      internal.error = null;
      this.emit("state", displayId, this.toView(internal));
    }
    console.info("[video-playback] stop: complete", { displayId, elapsedMs });
    if (elapsedMs > 3000) {
      console.warn("[video-playback] stop: slow completion", { displayId, elapsedMs });
    }
    return this.requireView(displayId);
  }

  async restart(displayId: string): Promise<VideoPlaybackSessionView> {
    await this.ensureOpen(displayId);
    this.addon?.restart(this.requireNativeId(displayId));
    return this.requireView(displayId);
  }

  async setLoop(displayId: string, enabled: boolean): Promise<VideoPlaybackSessionView> {
    const session = await this.ensureOpen(displayId);
    this.addon?.setLoop(this.requireNativeId(displayId), enabled);
    const internal = this.sessions.get(displayId);
    if (internal) {
      internal.loop = enabled;
      this.media.setLoopEnabled(internal.mediaAssetId, enabled);
    }
    this.emit("state", displayId, this.requireView(displayId));
    return this.getSession(displayId) ?? session;
  }

  close(displayId: string): void {
    const session = this.sessions.get(displayId);
    if (!session) return;
    this.addon?.close(session.nativeSessionId);
    this.sessions.delete(displayId);
    this.emit("closed", displayId);
  }

  closeAll(): void {
    for (const displayId of [...this.sessions.keys()]) {
      this.close(displayId);
    }
  }

  private requireNativeId(displayId: string): string {
    const session = this.sessions.get(displayId);
    if (!session) throw new Error("Video session is not open.");
    return session.nativeSessionId;
  }

  private requireView(displayId: string): VideoPlaybackSessionView {
    const session = this.sessions.get(displayId);
    if (!session) throw new Error("Video session is not open.");
    return this.toView(session);
  }

  private toView(session: InternalSession): VideoPlaybackSessionView {
    return {
      displayId: session.displayId,
      projectId: session.projectId,
      mediaAssetId: session.mediaAssetId,
      state: session.state,
      loop: session.loop,
      error: session.error,
      info: session.info,
      hasFrame: Boolean(session.latestFrame),
      ptsUs: session.latestFrame?.ptsUs ?? 0,
    };
  }
}

function normalizeState(value: string): VideoPlaybackState {
  switch (value) {
    case "idle":
    case "opened":
    case "playing":
    case "paused":
    case "stopped":
    case "ended":
    case "error":
      return value;
    default:
      return "idle";
  }
}
