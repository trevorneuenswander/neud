/** Hosted viewer bridge helpers aligned with desktop display-runtime-contract. */

export {
  DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION,
  describeDisplayRuntimePayloadShape,
  hasCanonicalDisplayFields,
  resolveDisplayRuntimeSnapshot,
  resolveHostedCanonicalSnapshot,
  type DisplayRuntimePayloadShape,
} from "../../../shared/display-runtime/normalize-display-snapshot.js";

export const NEUD_DISPLAY_MESSAGE_SOURCE = "neud-display" as const;
export const NEUD_RUNTIME_MESSAGE_SOURCE = "neud-runtime" as const;
export const NEUD_DISPLAY_READY_TYPE = "NEUD_DISPLAY_READY" as const;
export const NEUD_DATA_UPDATE_TYPE = "NEUD_DATA_UPDATE" as const;
export const NEUD_DATA_UPDATE_RECEIVED_TYPE = "NEUD_DATA_UPDATE_RECEIVED" as const;
export const NEUD_RENDER_STATUS_TYPE = "NEUD_RENDER_STATUS" as const;
export const NEUD_HOSTED_BRIDGE_STATUS_TYPE = "NEUD_HOSTED_BRIDGE_STATUS" as const;
export const NEUD_HOSTED_BRIDGE_BOOTED_TYPE = "NEUD_HOSTED_BRIDGE_BOOTED" as const;
export const NEUD_HOSTED_BRIDGE_ERROR_TYPE = "NEUD_HOSTED_BRIDGE_ERROR" as const;
export const NEUD_HOSTED_BRIDGE_REJECTED_TYPE = "NEUD_HOSTED_BRIDGE_REJECTED" as const;
export const NEUD_LAYOUT_REFRESH_TYPE = "NEUD_LAYOUT_REFRESH" as const;
export const NEUD_DATA_UPDATE_VERSION = 1;

export type NeudDisplayReadyMessage = {
  source: typeof NEUD_DISPLAY_MESSAGE_SOURCE;
  type: typeof NEUD_DISPLAY_READY_TYPE;
};

export type NeudDataUpdateMessage = {
  source: typeof NEUD_RUNTIME_MESSAGE_SOURCE;
  type: typeof NEUD_DATA_UPDATE_TYPE;
  version: typeof NEUD_DATA_UPDATE_VERSION;
  payload: Record<string, unknown>;
  revision?: number | null;
};

export type NeudDataUpdateReceivedMessage = {
  source: typeof NEUD_RUNTIME_MESSAGE_SOURCE;
  type: typeof NEUD_DATA_UPDATE_RECEIVED_TYPE;
  version: typeof NEUD_DATA_UPDATE_VERSION;
  revision?: number | null;
  runtimeGlobalPresent: boolean;
  subscriberCount: number;
  adapterInputShapeKeys?: string[];
  runtimeInputNormalized?: boolean;
};

export type NeudRenderStatusMessage = {
  source: typeof NEUD_RUNTIME_MESSAGE_SOURCE;
  type: typeof NEUD_RENDER_STATUS_TYPE;
  version: typeof NEUD_DATA_UPDATE_VERSION;
  revision?: number | null;
  adapter: string;
  inputReceived: boolean;
  currentLotResolved: boolean;
  bidResolved: boolean;
  photoCount: number;
  renderCompleted: boolean;
  skipReason: string | null;
  subscriptionRegistered?: boolean;
};

export type NeudHostedBridgeBootedMessage = {
  source: typeof NEUD_RUNTIME_MESSAGE_SOURCE;
  type: typeof NEUD_HOSTED_BRIDGE_BOOTED_TYPE;
  version: typeof NEUD_DATA_UPDATE_VERSION;
  bridgeVersion: string;
  runtimeGlobalPresent: boolean;
  publishFunctionPresent: boolean;
  inboundListenerInstalled: boolean;
  bootSequence?: number;
};

export type NeudHostedBridgeErrorMessage = {
  source: typeof NEUD_RUNTIME_MESSAGE_SOURCE;
  type: typeof NEUD_HOSTED_BRIDGE_ERROR_TYPE;
  version: typeof NEUD_DATA_UPDATE_VERSION;
  stage: "bootstrap" | "listener" | "publish";
  errorCategory: string;
};

export type NeudHostedBridgeRejectedMessage = {
  source: typeof NEUD_RUNTIME_MESSAGE_SOURCE;
  type: typeof NEUD_HOSTED_BRIDGE_REJECTED_TYPE;
  version: typeof NEUD_DATA_UPDATE_VERSION;
  reason: string;
};

export type NeudHostedBridgeStatusMessage = {
  source: typeof NEUD_DISPLAY_MESSAGE_SOURCE;
  type: typeof NEUD_HOSTED_BRIDGE_STATUS_TYPE;
  iframeUpdateReceived?: boolean;
  runtimeSubscribersCount?: number;
  lastSubscriberInvocationAt?: string | null;
  adapterSelected?: string | null;
  adapterInputShapeKeys?: string[];
  renderUpdateCompleted?: boolean;
  renderErrorCategory?: string | null;
  missingRequiredFields?: string[];
  runtimeInputNormalized?: boolean;
  payloadShapeVersion?: string | null;
  streamBidInputReceived?: boolean;
  currentLotResolved?: boolean;
  bidResolved?: boolean;
  photosResolvedCount?: number;
  renderSkippedReason?: string | null;
};

export function isNeudDisplayReadyMessage(value: unknown): value is NeudDisplayReadyMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as NeudDisplayReadyMessage;
  return (
    message.source === NEUD_DISPLAY_MESSAGE_SOURCE &&
    message.type === NEUD_DISPLAY_READY_TYPE
  );
}

export function isNeudDataUpdateMessage(value: unknown): value is NeudDataUpdateMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as NeudDataUpdateMessage;
  return (
    message.source === NEUD_RUNTIME_MESSAGE_SOURCE &&
    message.type === NEUD_DATA_UPDATE_TYPE &&
    message.version === NEUD_DATA_UPDATE_VERSION &&
    Boolean(message.payload) &&
    typeof message.payload === "object" &&
    !Array.isArray(message.payload)
  );
}

export function isNeudDataUpdateReceivedMessage(
  value: unknown,
): value is NeudDataUpdateReceivedMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as NeudDataUpdateReceivedMessage;
  return (
    message.source === NEUD_RUNTIME_MESSAGE_SOURCE &&
    message.type === NEUD_DATA_UPDATE_RECEIVED_TYPE &&
    message.version === NEUD_DATA_UPDATE_VERSION &&
    typeof message.runtimeGlobalPresent === "boolean" &&
    typeof message.subscriberCount === "number"
  );
}

export function isNeudRenderStatusMessage(value: unknown): value is NeudRenderStatusMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as NeudRenderStatusMessage;
  return (
    message.source === NEUD_RUNTIME_MESSAGE_SOURCE &&
    message.type === NEUD_RENDER_STATUS_TYPE &&
    message.version === NEUD_DATA_UPDATE_VERSION &&
    typeof message.adapter === "string" &&
    typeof message.inputReceived === "boolean" &&
    typeof message.renderCompleted === "boolean"
  );
}

export function isNeudHostedBridgeBootedMessage(
  value: unknown,
): value is NeudHostedBridgeBootedMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as NeudHostedBridgeBootedMessage;
  return (
    message.source === NEUD_RUNTIME_MESSAGE_SOURCE &&
    message.type === NEUD_HOSTED_BRIDGE_BOOTED_TYPE &&
    message.version === NEUD_DATA_UPDATE_VERSION &&
    message.inboundListenerInstalled === true
  );
}

export function isNeudHostedBridgeErrorMessage(
  value: unknown,
): value is NeudHostedBridgeErrorMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as NeudHostedBridgeErrorMessage;
  return (
    message.source === NEUD_RUNTIME_MESSAGE_SOURCE &&
    message.type === NEUD_HOSTED_BRIDGE_ERROR_TYPE &&
    message.version === NEUD_DATA_UPDATE_VERSION &&
    typeof message.errorCategory === "string"
  );
}

export function isNeudHostedBridgeRejectedMessage(
  value: unknown,
): value is NeudHostedBridgeRejectedMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as NeudHostedBridgeRejectedMessage;
  return (
    message.source === NEUD_RUNTIME_MESSAGE_SOURCE &&
    message.type === NEUD_HOSTED_BRIDGE_REJECTED_TYPE &&
    message.version === NEUD_DATA_UPDATE_VERSION &&
    typeof message.reason === "string"
  );
}

export function isNeudHostedBridgeStatusMessage(
  value: unknown,
): value is NeudHostedBridgeStatusMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as NeudHostedBridgeStatusMessage;
  return (
    message.source === NEUD_DISPLAY_MESSAGE_SOURCE &&
    message.type === NEUD_HOSTED_BRIDGE_STATUS_TYPE
  );
}

export function isHostedViewerMessageFromIframe(
  event: MessageEvent,
  iframeWindow: Window | null | undefined,
): boolean {
  if (!iframeWindow) {
    return false;
  }
  return event.source === iframeWindow;
}

export function resolveHostedPostMessageTargetOrigin(
  iframeWindow: Window | null | undefined,
  _parentOrigin: string,
): string {
  void _parentOrigin;
  try {
    const iframeOrigin = iframeWindow?.location?.origin;
    if (iframeOrigin && iframeOrigin !== "null") {
      return iframeOrigin;
    }
  } catch {
    // Sandboxed srcDoc iframes block parent reads of location — use wildcard delivery.
  }
  return "*";
}

export type NeudLayoutRefreshMessage = {
  source: typeof NEUD_RUNTIME_MESSAGE_SOURCE;
  type: typeof NEUD_LAYOUT_REFRESH_TYPE;
  version: typeof NEUD_DATA_UPDATE_VERSION;
  reason: string;
};

export function buildNeudLayoutRefreshMessage(reason: string): NeudLayoutRefreshMessage {
  return {
    source: NEUD_RUNTIME_MESSAGE_SOURCE,
    type: NEUD_LAYOUT_REFRESH_TYPE,
    version: NEUD_DATA_UPDATE_VERSION,
    reason,
  };
}

export function isNeudLayoutRefreshMessage(value: unknown): value is NeudLayoutRefreshMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const message = value as NeudLayoutRefreshMessage;
  return (
    message.source === NEUD_RUNTIME_MESSAGE_SOURCE &&
    message.type === NEUD_LAYOUT_REFRESH_TYPE &&
    message.version === NEUD_DATA_UPDATE_VERSION &&
    typeof message.reason === "string"
  );
}

export function buildNeudDataUpdateMessage(input: {
  payload: Record<string, unknown>;
  revision?: number | null;
}): NeudDataUpdateMessage {
  return {
    source: NEUD_RUNTIME_MESSAGE_SOURCE,
    type: NEUD_DATA_UPDATE_TYPE,
    version: NEUD_DATA_UPDATE_VERSION,
    payload: input.payload,
    revision: input.revision ?? null,
  };
}

export function isAllowedHostedViewerMessageOrigin(
  origin: string,
  expectedOrigin: string,
): boolean {
  if (!origin || origin === "null") {
    return true;
  }
  return origin === expectedOrigin;
}
