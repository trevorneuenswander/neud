/** Hosted viewer runtime metadata, diagnostics, and safe logging helpers. */

import { DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION } from "../../../shared/display-runtime/normalize-display-snapshot";
import { resolveHostedViewerDebugEnabled } from "./resolve-hosted-viewer-debug";

export const HOSTED_VIEWER_PARSER_VERSION = "2026-07-31.6";
export const HOSTED_RUNTIME_BRIDGE_VERSION = "3";
export { DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION };

export type HostedViewerStageDiagnostics = {
  buildLabel: string;
  appVersion: string;
  parserVersion: string;
  bridgeVersion: string;
  rpcCode: string | null;
  rpcBundleReady: boolean;
  publishedRevisionId: string | null;
  htmlLoaded: boolean;
  htmlPresent: boolean;
  bridgeMarkerPresent: boolean;
  iframeMounted: boolean;
  iframeWritten: boolean;
  iframeDocumentLoaded: boolean;
  canonicalPayloadResolved: boolean;
  canonicalPayloadPresent: boolean;
  bridgeReady: boolean;
  displayReadyReceived: boolean;
  hostedBridgeBooted: boolean;
  inboundListenerInstalled: boolean | null;
  runtimeGlobalPresentAtBoot: boolean | null;
  publishFunctionPresentAtBoot: boolean | null;
  activeIframeGeneration: number;
  dataUpdateAttempts: number;
  lastRejectionReason: string | null;
  lastMessagePostedType: string | null;
  lastMessagePostedRevision: number | null;
  lastDataRevisionSent: number | null;
  dataUpdateAckReceived: boolean;
  renderStatusReceived: boolean;
  iframeUpdateReceived: boolean;
  runtimeGlobalPresent: boolean | null;
  runtimeSubscribersCount: number | null;
  lastSubscriberInvocationAt: string | null;
  adapterSelected: string | null;
  adapterInputShapeKeys: string[];
  normalizedSnapshotKeys: string[];
  renderUpdateCompleted: boolean;
  renderErrorCategory: string | null;
  missingRequiredFields: string[];
  publisherOnline: boolean | null;
  sourceConnected: boolean | null;
  sourceOffline: boolean | null;
  sourceMode: string | null;
  canonicalDataPresent: boolean | null;
  dataStale: boolean | null;
  staleReason: string | null;
  snapshotAgeSeconds: number | null;
  publisherHeartbeatAgeSeconds: number | null;
  lastErrorCategory: string | null;
  payloadType: string | null;
  payloadTopLevelKeys: string[];
  payloadHasCurrent: boolean;
  payloadHasNext: boolean;
  payloadHasLots: boolean;
  payloadHasAuctionDisplay: boolean;
  payloadCurrentIsObject: boolean;
  payloadCurrentLotPresent: boolean;
  payloadBidFieldPresent: boolean;
  payloadPhotoCount: number;
  localPayloadShapeVersion: string;
  hostedPayloadShapeVersion: string;
  runtimeInputNormalized: boolean | null;
  streamBidInputReceived: boolean | null;
  currentLotResolved: boolean | null;
  bidResolved: boolean | null;
  photosResolvedCount: number | null;
  renderSkippedReason: string | null;
  pollingActive: boolean;
  pollingIntervalMs: number | null;
  lastPollAttemptedAt: string | null;
  lastPollSucceededAt: string | null;
  receivedCanonicalRevision: number | null;
  renderedCanonicalRevision: number | null;
  lastAcknowledgedCanonicalRevision: number | null;
  receivedPayloadFingerprint: string | null;
  lastPostedPayloadFingerprint: string | null;
  lastAcknowledgedPayloadFingerprint: string | null;
  lastRenderedPayloadFingerprint: string | null;
  pollErrorCategory: string | null;
  viewerMode: "portal-preview" | "fullscreen-output" | null;
  previewExpanded: boolean | null;
  iframeRecreatedCount: number;
  layoutRefreshPostedCount: number;
  lastLayoutRefreshReason: string | null;
  iframeRevisionId: string | null;
  firstPreviewMarqueeFailureStage: string | null;
  nonzeroLayoutDetected: boolean | null;
  initialPayloadDeferred: boolean | null;
  oneTimeLayoutReadySent: boolean | null;
  repeatedRefreshSuppressed: boolean | null;
  fullscreenReceivedPreviewRefresh: boolean | null;
  firstFailureStage: string | null;
};

export function shouldShowHostedViewerDebugPanel(search?: string | null): boolean {
  return resolveHostedViewerDebugEnabled(search ?? null);
}

export function resolveHostedViewerBuildLabel(): string {
  return process.env.NEXT_PUBLIC_NEUD_BUILD_LABEL ?? "local-dev";
}

export function resolveHostedViewerAppVersion(): string {
  return process.env.NEXT_PUBLIC_NEUD_APP_VERSION ?? "0.1.0";
}

export function describeCanonicalPayloadShape(
  payload: Record<string, unknown> | null | undefined,
): Pick<
  HostedViewerStageDiagnostics,
  | "payloadType"
  | "payloadTopLevelKeys"
  | "payloadHasCurrent"
  | "payloadHasNext"
  | "payloadHasLots"
  | "payloadHasAuctionDisplay"
> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      payloadType: payload == null ? "null" : typeof payload,
      payloadTopLevelKeys: [],
      payloadHasCurrent: false,
      payloadHasNext: false,
      payloadHasLots: false,
      payloadHasAuctionDisplay: false,
    };
  }

  return {
    payloadType: Array.isArray(payload) ? "array" : "object",
    payloadTopLevelKeys: Object.keys(payload),
    payloadHasCurrent: Boolean(payload.current),
    payloadHasNext: Array.isArray(payload.next),
    payloadHasLots: Array.isArray(payload.lots),
    payloadHasAuctionDisplay: Boolean(payload.auctionDisplay),
  };
}

export function logHostedViewerRpcBundle(input: {
  code: string | null;
  htmlPresent: boolean;
  htmlLength: number;
  canonicalDataPresent: boolean;
  canonicalRevision: number | null;
  publishedRevisionId: string | null;
  publisherOnline: boolean | null;
  sourceOffline: boolean | null;
}): void {
  if (!shouldShowHostedViewerDebugPanel()) {
    return;
  }

  console.debug("[HostedDisplayViewer] rpc_bundle", input);
}

export function logHostedViewerIframeWrite(input: {
  iframePresent: boolean;
  documentWriteAttempt: boolean;
  documentWriteSuccess: boolean;
  revisionKey: string | null;
}): void {
  if (!shouldShowHostedViewerDebugPanel()) {
    return;
  }

  console.debug("[HostedDisplayViewer] iframe_write", input);
}

export function logHostedViewerIframeReady(input: {
  sourceMatched: boolean;
  originMatched: boolean;
  messageType: string;
  bridgeVersion: string;
}): void {
  if (!shouldShowHostedViewerDebugPanel()) {
    return;
  }

  console.debug("[HostedDisplayViewer] iframe_ready", input);
}

export function logHostedViewerDataUpdate(input: {
  canonicalRevision: number | null;
  payloadKeyCount: number;
  postMessageSuccess: boolean;
  targetOrigin: string;
  normalizedSnapshotKeys?: string[];
}): void {
  if (!shouldShowHostedViewerDebugPanel()) {
    return;
  }

  console.debug("[HostedDisplayViewer] data_update", input);
}
