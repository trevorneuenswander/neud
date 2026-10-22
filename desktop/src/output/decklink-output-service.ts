import {
  deckLinkEndpointId,
  DECKLINK_DEVICE_UNAVAILABLE,
  DECKLINK_ENABLE_FAILED,
  DECKLINK_FIRST_FRAME_TIMEOUT,
  DECKLINK_MODE_UNSUPPORTED,
  DECKLINK_PLAYBACK_FAILED,
  DECKLINK_PREROLL_FRAMES,
  DECKLINK_SDK_UNAVAILABLE,
  formatExternalPortLabel,
  sortDeckLinkModes,
  type DeckLinkLiveMetrics,
  type DeckLinkVideoMode,
} from "./decklink-model.ts";
import {
  mapDeckLinkCapabilitiesToExternal,
  type DeckLinkEndpointCapabilitiesRaw,
} from "./external-output-capabilities.ts";
import { DeckLinkFillSession, type DeckLinkFrameResult } from "./decklink-session.ts";
import type { DeckLinkEnginePort, OutputDevice } from "./output-engine-core.ts";

export type DeckLinkEndpointRecord = {
  persistentId: string;
  modelName: string;
  endpointName: string;
  endpointIndex: number;
  available: boolean;
  modes: DeckLinkVideoMode[];
  capabilities?: DeckLinkEndpointCapabilitiesRaw;
};

export type DeckLinkFrameRenderer = {
  open(input: {
    routeId: string;
    url: string;
    width: number;
    height: number;
  }): Promise<{ ok: true; revision: number } | { ok: false; error: string }>;
  revision(routeId: string): number;
  repaintCount(routeId: string): number;
  publish(routeId: string, revision: number): void;
  close(routeId: string): void;
};

type LiveSession = {
  session: DeckLinkFillSession;
  displayModeId: string;
  modeName: string;
  width: number;
  height: number;
  fillBackground: string;
  endpointId: string;
  deviceModel: string;
  persistentId: string;
  endpointIndex: number;
  playbackStartedAt: string;
};

export class ScriptedFrameRenderer implements DeckLinkFrameRenderer {
  holdFirstFrame = false;
  readonly opened: Array<{ routeId: string; url: string; width: number; height: number }> = [];
  readonly closed: string[] = [];
  private readonly revisions = new Map<string, number>();
  private readonly repaints = new Map<string, number>();
  private readonly waiters = new Map<string, () => void>();

  async open(input: { routeId: string; url: string; width: number; height: number }) {
    this.opened.push(input);
    if (this.holdFirstFrame) {
      await new Promise<void>((resolve) => {
        this.waiters.set(input.routeId, resolve);
      });
    }
    if (this.closed.includes(input.routeId)) {
      return { ok: false as const, error: "Output stopped" };
    }
    this.revisions.set(input.routeId, 1);
    this.repaints.set(input.routeId, 1);
    return { ok: true as const, revision: 1 };
  }

  releaseFirstFrame(routeId: string): void {
    const release = this.waiters.get(routeId);
    this.waiters.delete(routeId);
    release?.();
  }

  revision(routeId: string): number {
    return this.revisions.get(routeId) ?? 0;
  }

  repaintCount(routeId: string): number {
    return this.repaints.get(routeId) ?? 0;
  }

  publish(routeId: string, revision: number): void {
    this.revisions.set(routeId, revision);
    this.repaints.set(routeId, this.repaintCount(routeId) + 1);
  }

  close(routeId: string): void {
    this.closed.push(routeId);
    this.releaseFirstFrame(routeId);
  }
}

export class DeckLinkOutputService implements DeckLinkEnginePort {
  readonly enabledEndpoints: string[] = [];
  readonly playbackStartedFor: string[] = [];
  readonly disabledEndpoints: string[] = [];
  readonly stoppedPlayback: string[] = [];
  private endpoints: DeckLinkEndpointRecord[] = [];
  private readonly sessions = new Map<string, LiveSession>();
  private readonly lostListeners: Array<(deviceId: string) => void> = [];
  private readonly sdkAvailable: boolean;
  private readonly sdkVersion: string | null;
  private readonly unavailableReason: string | null;

  private readonly renderer: DeckLinkFrameRenderer;

  constructor(
    renderer: DeckLinkFrameRenderer,
    options?: { sdkAvailable?: boolean; sdkVersion?: string | null; reason?: string | null },
  ) {
    this.renderer = renderer;
    this.sdkAvailable = options?.sdkAvailable !== false;
    this.sdkVersion = options?.sdkVersion ?? (this.sdkAvailable ? "mock" : null);
    this.unavailableReason = this.sdkAvailable ? null : options?.reason ?? DECKLINK_SDK_UNAVAILABLE;
  }

  setEndpoints(endpoints: DeckLinkEndpointRecord[]): void {
    this.endpoints = endpoints.map((endpoint) => ({
      ...endpoint,
      modes: sortDeckLinkModes(endpoint.modes ?? []),
    }));
  }

  availability() {
    return {
      sdkAvailable: this.sdkAvailable,
      sdkVersion: this.sdkVersion,
      reason: this.unavailableReason,
    };
  }

  discoverDevices(): OutputDevice[] {
    if (!this.sdkAvailable) return [];
    const siblingPortCount = this.endpoints.length;
    return this.endpoints.map((endpoint) => {
      const first = endpoint.modes[0];
      const external = mapDeckLinkCapabilitiesToExternal(endpoint.capabilities, { siblingPortCount });
      const pixelFormats = [
        ...new Set(endpoint.modes.flatMap((mode) => mode.pixelFormats ?? [])),
      ];
      return {
        id: deckLinkEndpointId(endpoint.persistentId, endpoint.endpointIndex),
        adapterType: "decklink" as const,
        name: formatExternalPortLabel(endpoint.modelName, endpoint.endpointIndex),
        available: endpoint.available,
        primary: false,
        capabilities: {
          kind: "decklink" as const,
          persistentId: endpoint.persistentId,
          modelName: endpoint.modelName,
          endpointName: endpoint.endpointName,
          endpointIndex: endpoint.endpointIndex,
          width: first?.width ?? 0,
          height: first?.height ?? 0,
          modes: endpoint.modes,
          external: { ...external, supportedPixelFormats: pixelFormats },
        },
      };
    });
  }

  onDeviceLost(listener: (deviceId: string) => void): void {
    this.lostListeners.push(listener);
  }

  loseDevice(deviceId: string): void {
    for (const listener of this.lostListeners) listener(deviceId);
  }

  metrics(routeId: string): DeckLinkLiveMetrics | null {
    const live = this.sessions.get(routeId);
    if (!live) return null;
    return live.session.metrics({
      sdkVersion: this.sdkVersion,
      deviceModel: live.deviceModel,
      persistentId: live.persistentId,
      endpointIndex: live.endpointIndex,
      displayModeId: live.displayModeId,
      modeName: live.modeName,
      width: live.width,
      height: live.height,
      fillBackground: live.fillBackground,
      rendererRevision: this.renderer.revision(routeId),
      rendererRepaints: this.renderer.repaintCount(routeId),
      playbackStartedAt: live.playbackStartedAt,
      startStage: live.session.playbackStarted ? "live" : null,
    });
  }

  async start(input: {
    routeId: string;
    routeName: string;
    device: OutputDevice;
    displayModeId: string;
    fillBackground: string;
    renderUrl: string;
    authoredWidth: number;
    authoredHeight: number;
  }) {
    if (!this.sdkAvailable) {
      return { ok: false as const, code: "sdk-unavailable", error: this.unavailableReason ?? DECKLINK_SDK_UNAVAILABLE };
    }
    if (input.device.capabilities.kind !== "decklink") {
      return { ok: false as const, code: "device-unavailable", error: DECKLINK_DEVICE_UNAVAILABLE };
    }
    const mode = input.device.capabilities.modes.find((entry) => entry.id === input.displayModeId);
    if (!mode) {
      return { ok: false as const, code: "mode-unavailable", error: DECKLINK_MODE_UNSUPPORTED };
    }
    const opened = await this.renderer.open({
      routeId: input.routeId,
      url: input.renderUrl,
      width: mode.width,
      height: mode.height,
    });
    if (!opened.ok) {
      this.renderer.close(input.routeId);
      return { ok: false as const, code: "renderer-failed", error: opened.error || DECKLINK_FIRST_FRAME_TIMEOUT };
    }
    const session = new DeckLinkFillSession(mode.frameRateNumerator, mode.frameRateDenominator);
    session.supplyFrame(opened.revision);
    const preroll = session.preroll();
    if (!preroll.ok || session.scheduledFrames < DECKLINK_PREROLL_FRAMES) {
      session.stop();
      this.renderer.close(input.routeId);
      return { ok: false as const, code: "playback-failed", error: DECKLINK_PLAYBACK_FAILED };
    }
    this.enabledEndpoints.push(input.device.id);
    const playback = session.startPlayback();
    if (!playback.ok) {
      session.stop();
      this.disabledEndpoints.push(input.device.id);
      this.renderer.close(input.routeId);
      return {
        ok: false as const,
        code: "playback-failed",
        error: DECKLINK_ENABLE_FAILED,
        nativeError: session.nativeError ?? undefined,
      };
    }
    this.playbackStartedFor.push(input.routeId);
    const caps = input.device.capabilities;
    this.sessions.set(input.routeId, {
      session,
      displayModeId: mode.id,
      modeName: mode.name,
      width: mode.width,
      height: mode.height,
      fillBackground: input.fillBackground,
      endpointId: input.device.id,
      deviceModel: caps.modelName,
      persistentId: caps.persistentId,
      endpointIndex: caps.endpointIndex,
      playbackStartedAt: new Date().toISOString(),
    });
    return { ok: true as const };
  }

  stop(routeId: string): void {
    const live = this.sessions.get(routeId);
    if (live) {
      live.session.stop();
      this.stoppedPlayback.push(routeId);
      this.disabledEndpoints.push(live.endpointId);
    }
    this.renderer.close(routeId);
    this.sessions.delete(routeId);
  }

  completeScheduledFrame(routeId: string, result: DeckLinkFrameResult = "completed"): void {
    const live = this.sessions.get(routeId);
    live?.session.complete(result, new Date().toISOString());
  }

  publishGraphic(routeId: string, revision: number): void {
    this.renderer.publish(routeId, revision);
    this.sessions.get(routeId)?.session.supplyFrame(revision);
  }

  noteUnderrun(routeId: string): void {
    this.sessions.get(routeId)?.session.noteUnderrun();
  }
}
