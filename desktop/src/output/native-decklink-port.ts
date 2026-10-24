import { createRequire } from "node:module";
import path from "node:path";
import {
  deckLinkEndpointId,
  DECKLINK_DEVICE_UNAVAILABLE,
  DECKLINK_MODE_UNSUPPORTED,
  DECKLINK_PIXEL_FORMAT_UNSUPPORTED,
  EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE,
  EXTERNAL_DEVICE_STUB_BUILD,
  EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE,
  EXTERNAL_NATIVE_ADDON_FAILED,
  formatDisplayOnlyFps,
  formatExternalPortLabel,
  sortDeckLinkModes,
  type DeckLinkLiveMetrics,
  type DeckLinkVideoMode,
} from "./decklink-model.ts";
import { DeckLinkOutputService } from "./decklink-output-service.ts";
import {
  mapDeckLinkCapabilitiesToExternal,
  type DeckLinkEndpointCapabilitiesRaw,
} from "./external-output-capabilities.ts";
import type { OffscreenOutputRenderer } from "./offscreen-output-renderer.ts";
import type { DeckLinkEnginePort, OutputDevice } from "./output-engine-core.ts";

const nativeRequire = createRequire(__filename);

type DeckLinkAddon = {
  probe: () => { sdkAvailable: boolean; sdkVersion: string; reason: string };
  discover: () => string;
  start: (endpointId: string, modeId: string, preroll: number, externalKeying?: boolean) => string;
  pushFrame: (frame: Buffer, width: number, height: number) => void;
  stop: () => void;
  metrics: () => string;
  getAdapterInfo?: () => string;
};

type ActiveRoute = {
  routeId: string;
  deviceModel: string;
  persistentId: string;
  endpointIndex: number;
  displayModeId: string;
  modeName: string;
  width: number;
  height: number;
  frameRateNumerator: number;
  frameRateDenominator: number;
  fillBackground: string;
  playbackStartedAt: string;
  startStage: string;
};

function addonPath(): string {
  return path.join(__dirname, "..", "platform", "decklink", "neud_decklink.node");
}

function loadAddon(): { addon: DeckLinkAddon | null; loadError: string | null } {
  const resolved = addonPath();
  try {
    return { addon: nativeRequire(resolved) as DeckLinkAddon, loadError: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[decklink] native helper unavailable", { path: resolved, error: message });
    return { addon: null, loadError: message };
  }
}

function readAdapterInfo(addon: DeckLinkAddon): {
  stub: boolean;
  compiledSdkVersion: string;
  runtimeSdkVersion: string;
  sdkAvailable: boolean;
} {
  try {
    if (!addon.getAdapterInfo) {
      return { stub: false, compiledSdkVersion: "", runtimeSdkVersion: "", sdkAvailable: false };
    }
    const parsed = JSON.parse(addon.getAdapterInfo()) as Record<string, unknown>;
    return {
      stub: parsed.stub === true,
      compiledSdkVersion: typeof parsed.compiledSdkVersion === "string" ? parsed.compiledSdkVersion : "",
      runtimeSdkVersion: typeof parsed.runtimeSdkVersion === "string" ? parsed.runtimeSdkVersion : "",
      sdkAvailable: parsed.sdkAvailable === true,
    };
  } catch {
    return { stub: false, compiledSdkVersion: "", runtimeSdkVersion: "", sdkAvailable: false };
  }
}

export function createDeckLinkPort(renderer: OffscreenOutputRenderer): DeckLinkEnginePort {
  const { addon, loadError } = loadAddon();
  if (!addon) {
    console.error("[decklink] capability chain failed at addon load", {
      path: addonPath(),
      loadError,
    });
    return new DeckLinkOutputService(renderer, {
      sdkAvailable: false,
      sdkVersion: null,
      reason: EXTERNAL_NATIVE_ADDON_FAILED,
    });
  }

  const adapter = readAdapterInfo(addon);
  const probed = addon.probe();
  console.info(
    "[decklink] capability probe",
    JSON.stringify({
      path: addonPath(),
      stub: adapter.stub,
      compiledSdkVersion: adapter.compiledSdkVersion || null,
      runtimeSdkVersion: adapter.runtimeSdkVersion || probed.sdkVersion || null,
      sdkAvailable: probed.sdkAvailable,
      probeReason: probed.reason || null,
    }),
  );

  if (adapter.stub) {
    console.error("[decklink] packaged helper is a stub build — not a functional DeckLink integration", {
      path: addonPath(),
      compiledSdkVersion: adapter.compiledSdkVersion || null,
    });
    return new DeckLinkOutputService(renderer, {
      sdkAvailable: false,
      sdkVersion: null,
      reason: EXTERNAL_DEVICE_STUB_BUILD,
    });
  }

  if (!probed.sdkAvailable) {
    return new DeckLinkOutputService(renderer, {
      sdkAvailable: false,
      sdkVersion: probed.sdkVersion || adapter.compiledSdkVersion || null,
      reason: EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE,
    });
  }

  return new NativeDeckLinkPort(addon, renderer, probed.sdkVersion || "Blackmagic Desktop Video");
}

class NativeDeckLinkPort implements DeckLinkEnginePort {
  private endpoints: Array<{
    persistentId: string;
    modelName: string;
    endpointName: string;
    endpointIndex: number;
    modes: DeckLinkVideoMode[];
    capabilities?: DeckLinkEndpointCapabilitiesRaw;
  }> = [];
  private active: ActiveRoute | null = null;

  constructor(
    private readonly addon: DeckLinkAddon,
    private readonly renderer: OffscreenOutputRenderer,
    private readonly sdkVersion: string,
  ) {
    this.refresh();
  }

  availability() {
    return { sdkAvailable: true, sdkVersion: this.sdkVersion, reason: null };
  }

  discoverDevices(): OutputDevice[] {
    this.refresh();
    const siblingPortCount = this.endpoints.length;
    return this.endpoints.map((endpoint) => {
      const first = endpoint.modes[0];
      const external = mapDeckLinkCapabilitiesToExternal(endpoint.capabilities, { siblingPortCount });
      const pixelFormats = [
        ...new Set(endpoint.modes.flatMap((mode) => mode.pixelFormats ?? [])),
      ];
      return {
        id: deckLinkEndpointId(String(endpoint.persistentId), endpoint.endpointIndex),
        adapterType: "decklink" as const,
        name: formatExternalPortLabel(endpoint.modelName, endpoint.endpointIndex),
        available: true,
        primary: false,
        capabilities: {
          kind: "decklink" as const,
          persistentId: String(endpoint.persistentId),
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

  private refresh(): void {
    try {
      const parsed = JSON.parse(this.addon.discover()) as NativeDeckLinkPort["endpoints"];
      this.endpoints = Array.isArray(parsed)
        ? parsed.map((endpoint) => ({
            ...endpoint,
            modes: sortDeckLinkModes(endpoint.modes ?? []),
          }))
        : [];
    } catch {
      this.endpoints = [];
    }
  }

  onDeviceLost(_listener: (deviceId: string) => void): void {}

  metrics(routeId: string): DeckLinkLiveMetrics | null {
    if (this.active?.routeId !== routeId) return null;
    const active = this.active;
    const raw = JSON.parse(this.addon.metrics()) as Record<string, number | string | boolean | null>;
    const frame = this.renderer.frame(routeId);
    const frameDuration = Number(raw.frameDuration ?? active.frameRateDenominator);
    const frameTimescale = Number(raw.frameTimescale ?? active.frameRateNumerator);
    const lastError =
      typeof raw.lastError === "string" && raw.lastError
        ? raw.lastError
        : typeof raw.nativeError === "string"
          ? raw.nativeError
          : null;
    return {
      sdkVersion: this.sdkVersion,
      pixelFormat: "bgra8",
      deviceModel: String(raw.deviceModel ?? active.deviceModel),
      persistentId: String(raw.persistentId ?? active.persistentId),
      endpointIndex: Number(raw.endpointIndex ?? active.endpointIndex),
      displayModeId: String(raw.displayModeId ?? active.displayModeId),
      modeName: String(raw.displayModeName ?? active.modeName),
      displayModeName: String(raw.displayModeName ?? active.modeName),
      frameRateNumerator: frameTimescale,
      frameRateDenominator: frameDuration,
      frameDuration,
      frameTimescale,
      computedFpsForDisplayOnly:
        typeof raw.computedFpsForDisplayOnly === "string" && raw.computedFpsForDisplayOnly
          ? raw.computedFpsForDisplayOnly
          : formatDisplayOnlyFps(frameTimescale, frameDuration),
      width: Number(raw.width ?? active.width),
      height: Number(raw.height ?? active.height),
      rendererWidth: frame?.width ?? Number(raw.rendererWidth ?? active.width),
      rendererHeight: frame?.height ?? Number(raw.rendererHeight ?? active.height),
      rowBytes: Number(raw.rowBytes ?? active.width * 4),
      rendererPixelOrder: this.renderer.pixelOrder,
      fillBackground: active.fillBackground,
      scheduledFrames: Number(raw.scheduledFrames ?? 0),
      completedFrames: Number(raw.completedFrames ?? 0),
      droppedFrames: Number(raw.droppedFrames ?? 0),
      lateFrames: Number(raw.lateFrames ?? 0),
      underruns: Number(raw.underruns ?? 0),
      reusedFrames: 0,
      queueDepth: Number(raw.queueDepth ?? 0),
      lastFrameCompletionAt: null,
      lastCompletionResult: typeof raw.lastCompletionResult === "string" ? raw.lastCompletionResult : null,
      lastScheduledRevision: frame?.revision ?? null,
      rendererRevision: frame?.revision ?? 0,
      rendererRepaints: frame?.repaints ?? 0,
      playbackStartedAt: active.playbackStartedAt,
      playbackStarted: Boolean(raw.playbackStarted ?? true),
      outputEnabled: Boolean(raw.outputEnabled ?? true),
      lastError,
      nativeError: lastError,
      startStage: active.startStage,
    };
  }

  async start(input: Parameters<DeckLinkEnginePort["start"]>[0]) {
    if (input.device.capabilities.kind !== "decklink") {
      return { ok: false as const, code: "device-unavailable", error: DECKLINK_DEVICE_UNAVAILABLE };
    }
    const mode = input.device.capabilities.modes.find((entry) => entry.id === input.displayModeId);
    if (!mode) {
      return { ok: false as const, code: "mode-unavailable", error: DECKLINK_MODE_UNSUPPORTED };
    }
    if (!mode.pixelFormats.includes("bgra8")) {
      return {
        ok: false as const,
        code: "pixel-format-unsupported",
        error: DECKLINK_PIXEL_FORMAT_UNSUPPORTED,
      };
    }

    // 1–5: resolve mode + open offscreen renderer at exact output surface; wait for first paint.
    const opened = await this.renderer.open({
      routeId: input.routeId,
      url: input.renderUrl,
      width: mode.width,
      height: mode.height,
    });
    if (!opened.ok) {
      return {
        ok: false as const,
        code: "renderer-failed",
        error: opened.error,
        nativeError: "wait-first-frame",
      };
    }
    const frame = this.renderer.frame(input.routeId);
    if (!frame) {
      this.renderer.close(input.routeId);
      return {
        ok: false as const,
        code: "renderer-failed",
        error: "DeckLink output did not receive a rendered frame",
        nativeError: "wait-first-frame",
      };
    }
    // Push Chromium paint BGRA (verified premultiplied).
    // Fill-only: native composites over black. Key+Fill: native unpremultiplies to straight + enables keyer.
    this.addon.pushFrame(frame.bgra, frame.width, frame.height);

    const endpointId = deckLinkEndpointId(
      input.device.capabilities.persistentId,
      input.device.capabilities.endpointIndex,
    );
    const externalKeying = input.presentationMode === "keyFill";
    // 6–12: enable output (+ optional IDeckLinkKeyer), DoesSupport BGRA, preroll, StartScheduledPlayback.
    const started = JSON.parse(this.addon.start(endpointId, mode.id, 3, externalKeying)) as {
      ok: boolean;
      code?: string;
      error?: string;
      nativeError?: string;
      stage?: string;
      displayModeName?: string;
      frameDuration?: number;
      frameTimescale?: number;
      playbackStartedAt?: number;
    };
    if (!started.ok) {
      this.renderer.close(input.routeId);
      const stage = started.stage ? ` [${started.stage}]` : "";
      return {
        ok: false as const,
        code: started.code || "playback-failed",
        error: `${started.error || "Scheduled playback failed"}${stage}`,
        nativeError: started.nativeError || started.stage,
      };
    }

    const playbackStartedAt =
      typeof started.playbackStartedAt === "number" && started.playbackStartedAt > 0
        ? new Date(started.playbackStartedAt).toISOString()
        : new Date().toISOString();
    this.active = {
      routeId: input.routeId,
      deviceModel: input.device.capabilities.modelName,
      persistentId: input.device.capabilities.persistentId,
      endpointIndex: input.device.capabilities.endpointIndex,
      displayModeId: mode.id,
      modeName: started.displayModeName || mode.name,
      width: mode.width,
      height: mode.height,
      frameRateNumerator: started.frameTimescale ?? mode.frameRateNumerator,
      frameRateDenominator: started.frameDuration ?? mode.frameRateDenominator,
      fillBackground: input.fillBackground,
      playbackStartedAt,
      startStage: started.stage || "live",
    };
    let lastPushedRevision = frame.revision;
    this.renderer.onFrame(input.routeId, (next) => {
      if (this.active?.routeId !== input.routeId) return;
      // Skip duplicate revisions; native already holds the last good frame for SDI cadence.
      if (next.revision === lastPushedRevision) return;
      lastPushedRevision = next.revision;
      this.addon.pushFrame(next.bgra, next.width, next.height);
    });
    return { ok: true as const };
  }

  stop(routeId: string): void {
    if (this.active?.routeId === routeId) {
      this.addon.stop();
      this.active = null;
    }
    this.renderer.close(routeId);
  }
}
