"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { prepareHostedDisplayDocument } from "@/lib/developer-tools/display-document";
import {
  buildNeudDataUpdateMessage,
  buildNeudLayoutRefreshMessage,
  describeDisplayRuntimePayloadShape,
  DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION,
  isAllowedHostedViewerMessageOrigin,
  isHostedViewerMessageFromIframe,
  isNeudDataUpdateReceivedMessage,
  isNeudDisplayReadyMessage,
  isNeudHostedBridgeBootedMessage,
  isNeudHostedBridgeErrorMessage,
  isNeudHostedBridgeRejectedMessage,
  isNeudHostedBridgeStatusMessage,
  isNeudRenderStatusMessage,
  NEUD_DATA_UPDATE_TYPE,
  resolveDisplayRuntimeSnapshot,
  resolveHostedPostMessageTargetOrigin,
} from "@/lib/hosted/hosted-display-runtime-bridge";
import {
  HOSTED_RUNTIME_BRIDGE_VERSION,
  HOSTED_VIEWER_PARSER_VERSION,
  logHostedViewerDataUpdate,
  logHostedViewerIframeReady,
  logHostedViewerIframeWrite,
  logHostedViewerRpcBundle,
  resolveHostedViewerAppVersion,
  resolveHostedViewerBuildLabel,
  shouldShowHostedViewerDebugPanel,
  type HostedViewerStageDiagnostics,
} from "@/lib/hosted/hosted-viewer-runtime";
import {
  logViewerBundleDiagnostic,
  parseViewerBundleRpcResult,
  summarizeViewerBundleDiagnostic,
  type ParsedViewerBundle,
} from "@/lib/hosted/viewer-bundle";
import {
  computeAgeSeconds,
  resolveViewerStatusNotice,
} from "@/lib/hosted/viewer-status";
import { normalizeDisplayRefreshRateMs } from "@/lib/displays/refresh-rate";
import { createClient } from "@/lib/supabase/client";
import { HostedViewerDiagnosticsPanel } from "@/components/hosted/HostedViewerDiagnosticsPanel";
import {
  buildAbsoluteHostedFullscreenViewerUrl,
  buildHostedFullscreenViewerPath,
} from "@/lib/hosted/viewer-url";
import { useHostedPortalOrigin } from "@/lib/hosted/use-hosted-portal-origin";
import {
  shouldApplyRevisionStatus,
  shouldDeliverCanonicalPayload,
} from "@/lib/hosted/hosted-viewer-delivery";
import { fingerprintCanonicalPayloadContent } from "@/lib/hosted/canonical-payload-fingerprint";
import { resolveStorageObjectIdsViaProxy } from "@/lib/hosted/resolve-hosted-photo-urls";
import { HostedFullscreenOutputShell } from "@/components/hosted/HostedFullscreenOutputShell";
import {
  toHostedDisplayStatusInput,
  type HostedDisplayCardDisplay,
} from "@/lib/hosted/hosted-display-snapshot";
import {
  resolveViewerLoadErrorMessageForDisplay,
  type HostedDisplayStatusInput,
} from "@/lib/hosted/hosted-display-connection-status";

type HostedViewerMode = "portal-preview" | "fullscreen-output";

type HostedDisplayViewerClientProps = {
  projectSlug: string;
  displaySlug: string;
  mode: "private" | "public";
  viewerMode?: HostedViewerMode;
  /** Hides toolbar/status chrome for embedded card previews while keeping live polling. */
  embedded?: boolean;
  displaySnapshot?: HostedDisplayCardDisplay | null;
};

type LoadedViewerBundle = Extract<ParsedViewerBundle, { ok: true }>;

const HOSTED_ACK_RETRY_DELAYS_MS = [0, 250, 750] as const;
const HOSTED_ACK_TIMEOUT_MS = 2_000;

function createInitialDiagnostics(): HostedViewerStageDiagnostics {
  return {
    buildLabel: resolveHostedViewerBuildLabel(),
    appVersion: resolveHostedViewerAppVersion(),
    parserVersion: HOSTED_VIEWER_PARSER_VERSION,
    bridgeVersion: HOSTED_RUNTIME_BRIDGE_VERSION,
    rpcCode: null,
    rpcBundleReady: false,
    publishedRevisionId: null,
    htmlLoaded: false,
    htmlPresent: false,
    bridgeMarkerPresent: false,
    iframeMounted: false,
    iframeWritten: false,
    iframeDocumentLoaded: false,
    canonicalPayloadResolved: false,
    canonicalPayloadPresent: false,
    bridgeReady: false,
    displayReadyReceived: false,
    hostedBridgeBooted: false,
    inboundListenerInstalled: null,
    runtimeGlobalPresentAtBoot: null,
    publishFunctionPresentAtBoot: null,
    activeIframeGeneration: 0,
    dataUpdateAttempts: 0,
    lastRejectionReason: null,
    lastMessagePostedType: null,
    lastMessagePostedRevision: null,
    lastDataRevisionSent: null,
    dataUpdateAckReceived: false,
    renderStatusReceived: false,
    iframeUpdateReceived: false,
    runtimeGlobalPresent: null,
    runtimeSubscribersCount: null,
    lastSubscriberInvocationAt: null,
    adapterSelected: null,
    adapterInputShapeKeys: [],
    normalizedSnapshotKeys: [],
    renderUpdateCompleted: false,
    renderErrorCategory: null,
    missingRequiredFields: [],
    publisherOnline: null,
    sourceConnected: null,
    sourceOffline: null,
    sourceMode: null,
    canonicalDataPresent: null,
    dataStale: null,
    staleReason: null,
    snapshotAgeSeconds: null,
    publisherHeartbeatAgeSeconds: null,
    lastErrorCategory: null,
    payloadType: null,
    payloadTopLevelKeys: [],
    payloadHasCurrent: false,
    payloadHasNext: false,
    payloadHasLots: false,
    payloadHasAuctionDisplay: false,
    payloadCurrentIsObject: false,
    payloadCurrentLotPresent: false,
    payloadBidFieldPresent: false,
    payloadPhotoCount: 0,
    localPayloadShapeVersion: DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION,
    hostedPayloadShapeVersion: DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION,
    runtimeInputNormalized: null,
    streamBidInputReceived: null,
    currentLotResolved: null,
    bidResolved: null,
    photosResolvedCount: null,
    renderSkippedReason: null,
    pollingActive: false,
    pollingIntervalMs: null,
    lastPollAttemptedAt: null,
    lastPollSucceededAt: null,
    receivedCanonicalRevision: null,
    renderedCanonicalRevision: null,
    lastAcknowledgedCanonicalRevision: null,
    receivedPayloadFingerprint: null,
    lastPostedPayloadFingerprint: null,
    lastAcknowledgedPayloadFingerprint: null,
    lastRenderedPayloadFingerprint: null,
    pollErrorCategory: null,
    viewerMode: null,
    previewExpanded: null,
    iframeRecreatedCount: 0,
    layoutRefreshPostedCount: 0,
    lastLayoutRefreshReason: null,
    iframeRevisionId: null,
    firstPreviewMarqueeFailureStage: null,
    nonzeroLayoutDetected: null,
    initialPayloadDeferred: null,
    oneTimeLayoutReadySent: null,
    repeatedRefreshSuppressed: null,
    fullscreenReceivedPreviewRefresh: null,
    firstFailureStage: null,
  };
}

function mapPayloadDiagnostics(input: {
  payload: Record<string, unknown>;
  snapshot: Record<string, unknown> | null;
  revision: number | null;
}) {
  const payloadShape = describeDisplayRuntimePayloadShape({
    payload: input.payload,
    messageType: NEUD_DATA_UPDATE_TYPE,
    revision: input.revision,
  });

  return {
    payloadType: payloadShape.topLevelKeys.length > 0 ? "object" : "null",
    payloadTopLevelKeys: payloadShape.topLevelKeys,
    payloadHasCurrent: payloadShape.presence.current,
    payloadHasNext: payloadShape.presence.next,
    payloadHasLots: payloadShape.presence.lots,
    payloadHasAuctionDisplay: payloadShape.presence.auctionDisplay,
    payloadCurrentIsObject: payloadShape.presence.current,
    payloadCurrentLotPresent: payloadShape.presence.currentLotPresent,
    payloadBidFieldPresent: payloadShape.presence.currentBidPresent,
    payloadPhotoCount: payloadShape.presence.photoCount,
    hostedPayloadShapeVersion: payloadShape.version,
    runtimeInputNormalized: Boolean(input.snapshot),
    canonicalPayloadResolved: Boolean(input.snapshot),
    canonicalPayloadPresent: payloadShape.topLevelKeys.length > 0,
    normalizedSnapshotKeys: input.snapshot ? Object.keys(input.snapshot) : [],
  };
}

function describeIframeWindowToken(contentWindow: Window | null | undefined): string | null {
  if (!contentWindow) {
    return null;
  }
  return `win-${Object.prototype.toString.call(contentWindow)}`;
}

export function HostedDisplayViewerClient({
  projectSlug,
  displaySlug,
  mode,
  viewerMode: viewerModeProp,
  embedded = false,
  displaySnapshot = null,
}: HostedDisplayViewerClientProps) {
  const viewerMode: HostedViewerMode = viewerModeProp ?? "portal-preview";
  const isFullscreenOutput = viewerMode === "fullscreen-output";
  const isPortalPreview = viewerMode === "portal-preview" && !embedded;
  const showChrome = isPortalPreview && !embedded;
  const hostedPortalOrigin = useHostedPortalOrigin();
  const displayStatusInput = useMemo(
    (): HostedDisplayStatusInput | null =>
      displaySnapshot ? toHostedDisplayStatusInput(displaySnapshot) : null,
    [displaySnapshot],
  );
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const [debugSearch, setDebugSearch] = useState("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const iframeGenerationRef = useRef(0);
  const iframeRecreatedCountRef = useRef(0);
  const layoutRefreshPostedCountRef = useRef(0);
  const previewLayoutReadyRef = useRef(!embedded);
  const oneTimeLayoutRefreshSentRef = useRef(false);
  const bootedGenerationRef = useRef<number | null>(null);
  const lastPostedCanonicalRevisionRef = useRef<number | null>(null);
  const lastPostedPayloadFingerprintRef = useRef<string | null>(null);
  const lastAcknowledgedCanonicalRevisionRef = useRef<number | null>(null);
  const lastAcknowledgedPayloadFingerprintRef = useRef<string | null>(null);
  const lastRenderedCanonicalRevisionRef = useRef<number | null>(null);
  const lastRenderedPayloadFingerprintRef = useRef<string | null>(null);
  const loadedRevisionRef = useRef<string | null>(null);
  const latestSnapshotRef = useRef<Record<string, unknown> | null>(null);
  const latestCanonicalPayloadRef = useRef<Record<string, unknown> | null>(null);
  const latestRevisionRef = useRef<number | null>(null);
  const ackRetryTimersRef = useRef<number[]>([]);
  const ackTimeoutRef = useRef<number | null>(null);
  const bundleRef = useRef<LoadedViewerBundle | null>(null);
  const lastDeliveredFingerprintRef = useRef<string | null>(null);
  const hasLoadedBundleRef = useRef(false);
  const [bundle, setBundle] = useState<LoadedViewerBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<HostedViewerStageDiagnostics>(
    createInitialDiagnostics,
  );

  const showDebugPanel = shouldShowHostedViewerDebugPanel(debugSearch);
  const pollIntervalMs = normalizeDisplayRefreshRateMs(bundle?.display.refresh_rate_ms);

  useEffect(() => {
    setDebugSearch(window.location.search);
  }, []);

  const preparedHtml = useMemo(() => {
    if (!bundle?.htmlContent) {
      return null;
    }
    const hostedHtml = prepareHostedDisplayDocument(bundle.htmlContent, {
      displaySlug: displaySlug,
      projectSlug: projectSlug,
    });
    const viewerModeScript = `<script>window.__NEUD_VIEWER_MODE__=${JSON.stringify(viewerMode)};</script>`;
    if (/<head[^>]*>/i.test(hostedHtml)) {
      return hostedHtml.replace(/<head([^>]*)>/i, `<head$1>\n${viewerModeScript}`);
    }
    return `${viewerModeScript}\n${hostedHtml}`;
  }, [bundle?.htmlContent, bundle?.revisionKey, displaySlug, projectSlug, viewerMode]);

  const clearAckTimers = useCallback(() => {
    for (const timer of ackRetryTimersRef.current) {
      window.clearTimeout(timer);
    }
    ackRetryTimersRef.current = [];
    if (ackTimeoutRef.current != null) {
      window.clearTimeout(ackTimeoutRef.current);
      ackTimeoutRef.current = null;
    }
  }, []);

  const clearLayoutRefreshBurstTimers = useCallback(() => {
    // Reserved for embedded preview one-shot timers if added later.
  }, []);

  const postLayoutRefreshToIframe = useCallback(
    (reason: string) => {
      if (!embedded) {
        setDiagnostics((current) => ({
          ...current,
          fullscreenReceivedPreviewRefresh:
            current.fullscreenReceivedPreviewRefresh ?? false,
          repeatedRefreshSuppressed: true,
        }));
        return false;
      }
      if (oneTimeLayoutRefreshSentRef.current) {
        setDiagnostics((current) => ({
          ...current,
          repeatedRefreshSuppressed: true,
        }));
        return false;
      }
      const iframe = iframeRef.current;
      const contentWindow = iframe?.contentWindow ?? null;
      if (!contentWindow) {
        return false;
      }
      const targetOrigin = resolveHostedPostMessageTargetOrigin(
        contentWindow,
        window.location.origin,
      );
      try {
        contentWindow.postMessage(buildNeudLayoutRefreshMessage(reason), targetOrigin);
        layoutRefreshPostedCountRef.current += 1;
        oneTimeLayoutRefreshSentRef.current = true;
        setDiagnostics((current) => ({
          ...current,
          layoutRefreshPostedCount: layoutRefreshPostedCountRef.current,
          lastLayoutRefreshReason: reason,
          previewExpanded: true,
          oneTimeLayoutReadySent: true,
        }));
        return true;
      } catch {
        return false;
      }
    },
    [embedded],
  );

  const resetIframeHandshakeState = useCallback(
    (revisionKey: string | null) => {
      iframeGenerationRef.current += 1;
      iframeRecreatedCountRef.current += 1;
      previewLayoutReadyRef.current = !embedded;
      oneTimeLayoutRefreshSentRef.current = false;
      bootedGenerationRef.current = null;
      lastPostedCanonicalRevisionRef.current = null;
      lastPostedPayloadFingerprintRef.current = null;
      lastAcknowledgedCanonicalRevisionRef.current = null;
      lastAcknowledgedPayloadFingerprintRef.current = null;
      lastRenderedCanonicalRevisionRef.current = null;
      lastRenderedPayloadFingerprintRef.current = null;
      lastDeliveredFingerprintRef.current = null;
      clearAckTimers();
      setDiagnostics((current) => ({
        ...current,
        activeIframeGeneration: iframeGenerationRef.current,
        bridgeReady: false,
        displayReadyReceived: false,
        hostedBridgeBooted: false,
        inboundListenerInstalled: null,
        runtimeGlobalPresentAtBoot: null,
        publishFunctionPresentAtBoot: null,
        iframeWritten: false,
        iframeDocumentLoaded: false,
        iframeUpdateReceived: false,
        dataUpdateAckReceived: false,
        renderStatusReceived: false,
        dataUpdateAttempts: 0,
        lastRejectionReason: null,
        lastAcknowledgedCanonicalRevision: null,
        renderedCanonicalRevision: null,
        receivedCanonicalRevision: null,
        receivedPayloadFingerprint: null,
        runtimeSubscribersCount: null,
        runtimeGlobalPresent: null,
        lastSubscriberInvocationAt: null,
        adapterSelected: null,
        adapterInputShapeKeys: [],
        renderUpdateCompleted: false,
        renderErrorCategory: null,
        missingRequiredFields: [],
        streamBidInputReceived: null,
        currentLotResolved: null,
        bidResolved: null,
        photosResolvedCount: null,
        renderSkippedReason: null,
        lastErrorCategory: null,
        bridgeMarkerPresent: preparedHtml?.includes("neud-hosted-bridge:v3") ?? false,
        iframeRecreatedCount: iframeRecreatedCountRef.current,
        iframeRevisionId: revisionKey,
        previewExpanded: embedded ? true : null,
      }));
      logHostedViewerIframeWrite({
        iframePresent: Boolean(iframeRef.current),
        documentWriteAttempt: true,
        documentWriteSuccess: Boolean(preparedHtml),
        revisionKey,
      });
    },
    [clearAckTimers, embedded, preparedHtml],
  );

  const deliverSnapshotToIframe = useCallback(() => {
    const generation = iframeGenerationRef.current;
    const snapshot = latestSnapshotRef.current;
    const canonicalPayload = latestCanonicalPayloadRef.current;
    const revision = latestRevisionRef.current;
    const iframe = iframeRef.current;
    const contentWindow = iframe?.contentWindow ?? null;
    const iframeBooted = bootedGenerationRef.current === generation;
    const payloadFingerprint = canonicalPayload
      ? fingerprintCanonicalPayloadContent(canonicalPayload)
      : null;
    const alreadyAcknowledged =
      revision != null &&
      payloadFingerprint != null &&
      revision === lastAcknowledgedCanonicalRevisionRef.current &&
      payloadFingerprint === lastAcknowledgedPayloadFingerprintRef.current;

    if (
      !iframeBooted ||
      !contentWindow ||
      !snapshot ||
      (embedded && !previewLayoutReadyRef.current) ||
      alreadyAcknowledged ||
      !shouldDeliverCanonicalPayload({
        targetRevision: revision,
        targetFingerprint: payloadFingerprint,
        lastAcknowledgedRevision: lastAcknowledgedCanonicalRevisionRef.current,
        lastAcknowledgedFingerprint: lastAcknowledgedPayloadFingerprintRef.current,
        iframeBooted,
      })
    ) {
      if (embedded && !previewLayoutReadyRef.current && iframeBooted && snapshot) {
        setDiagnostics((current) => ({
          ...current,
          initialPayloadDeferred: true,
        }));
      }
      return alreadyAcknowledged;
    }

    const targetOrigin = resolveHostedPostMessageTargetOrigin(
      contentWindow,
      window.location.origin,
    );

    try {
      contentWindow.postMessage(
        buildNeudDataUpdateMessage({
          payload: snapshot,
          revision,
        }),
        targetOrigin,
      );
      lastPostedCanonicalRevisionRef.current = revision;
      lastPostedPayloadFingerprintRef.current = payloadFingerprint;
      if (payloadFingerprint) {
        lastDeliveredFingerprintRef.current = payloadFingerprint;
      }
      setDiagnostics((current) => ({
        ...current,
        activeIframeGeneration: generation,
        lastDataRevisionSent: revision,
        lastMessagePostedType: NEUD_DATA_UPDATE_TYPE,
        lastMessagePostedRevision: revision,
        lastPostedCanonicalRevision: revision,
        lastPostedPayloadFingerprint: payloadFingerprint,
        normalizedSnapshotKeys: Object.keys(snapshot),
        dataUpdateAttempts: current.dataUpdateAttempts + 1,
        viewerMode,
      }));
      logHostedViewerDataUpdate({
        canonicalRevision: latestRevisionRef.current,
        payloadKeyCount: Object.keys(snapshot).length,
        postMessageSuccess: true,
        targetOrigin,
        normalizedSnapshotKeys: Object.keys(snapshot),
      });
      return true;
    } catch (deliveryError) {
      logHostedViewerDataUpdate({
        canonicalRevision: latestRevisionRef.current,
        payloadKeyCount: Object.keys(snapshot).length,
        postMessageSuccess: false,
        targetOrigin,
        normalizedSnapshotKeys: Object.keys(snapshot),
      });
      console.debug("[HostedDisplayViewer] data_update_failed", {
        message: deliveryError instanceof Error ? deliveryError.message : String(deliveryError),
        generation,
        iframeWindow: describeIframeWindowToken(contentWindow),
      });
      return false;
    }
  }, [viewerMode]);

  const deliverSnapshotRef = useRef(deliverSnapshotToIframe);
  deliverSnapshotRef.current = deliverSnapshotToIframe;

  const scheduleBoundedAckRetries = useCallback(
    (generation: number, targetRevision: number | null) => {
      clearAckTimers();
      for (const delayMs of HOSTED_ACK_RETRY_DELAYS_MS) {
        const timer = window.setTimeout(() => {
          if (iframeGenerationRef.current !== generation) {
            return;
          }
          if (lastAcknowledgedCanonicalRevisionRef.current === targetRevision) {
            return;
          }
          deliverSnapshotRef.current();
        }, delayMs);
        ackRetryTimersRef.current.push(timer);
      }

      ackTimeoutRef.current = window.setTimeout(() => {
        if (iframeGenerationRef.current !== generation) {
          return;
        }
        if (lastAcknowledgedCanonicalRevisionRef.current === targetRevision) {
          return;
        }
        setDiagnostics((current) => ({
          ...current,
          lastErrorCategory: "hosted_bridge_no_ack",
        }));
      }, HOSTED_ACK_TIMEOUT_MS);
    },
    [clearAckTimers],
  );

  const notifyEmbeddedLayoutReady = useCallback(() => {
    if (!embedded || previewLayoutReadyRef.current) {
      return;
    }
    previewLayoutReadyRef.current = true;
    setDiagnostics((current) => ({
      ...current,
      nonzeroLayoutDetected: true,
      previewExpanded: true,
      initialPayloadDeferred: false,
    }));
    deliverSnapshotRef.current();
    scheduleBoundedAckRetries(
      iframeGenerationRef.current,
      latestRevisionRef.current,
    );
    window.setTimeout(() => {
      postLayoutRefreshToIframe("preview_layout_ready");
    }, 0);
  }, [embedded, postLayoutRefreshToIframe, scheduleBoundedAckRetries]);

  const handleHostedBridgeBooted = useCallback(
    (generation: number) => {
      bootedGenerationRef.current = generation;
      if (!embedded || previewLayoutReadyRef.current) {
        deliverSnapshotRef.current();
        scheduleBoundedAckRetries(generation, latestRevisionRef.current);
      }
    },
    [embedded, scheduleBoundedAckRetries],
  );

  const loadBundle = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (mode === "private" && !session) {
      const nextPath = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/login?next=${encodeURIComponent(nextPath)}`;
      return;
    }

    const pollAttemptedAt = new Date().toISOString();
    setDiagnostics((current) => ({
      ...current,
      pollingActive: true,
      pollingIntervalMs: pollIntervalMs,
      lastPollAttemptedAt: pollAttemptedAt,
    }));

    const { data, error: rpcError } = await supabase.rpc("get_online_display_viewer_bundle", {
      p_project_slug: projectSlug,
      p_display_slug: displaySlug,
    });

    const parsed = parseViewerBundleRpcResult(data, rpcError);
    const diagnostic = summarizeViewerBundleDiagnostic({
      rpcData: data,
      rpcError,
      sessionAvailable: Boolean(session),
      membershipAccess: session ? "unknown" : "anonymous",
    });
    logViewerBundleDiagnostic("[HostedDisplayViewer]", diagnostic);
    logHostedViewerRpcBundle({
      code: diagnostic.code,
      htmlPresent: diagnostic.htmlPresent,
      htmlLength: diagnostic.htmlLength,
      canonicalDataPresent: diagnostic.canonicalDataPresent ?? false,
      canonicalRevision: diagnostic.canonicalRevision,
      publishedRevisionId: diagnostic.publishedRevisionId,
      publisherOnline: diagnostic.publisherOnline,
      sourceOffline: diagnostic.sourceOffline,
    });

    if (!parsed.ok) {
      setDiagnostics((current) => ({
        ...current,
        rpcCode: parsed.code,
        rpcBundleReady: bundleRef.current != null,
        pollErrorCategory: parsed.code,
        lastErrorCategory: bundleRef.current ? current.lastErrorCategory : parsed.code,
        viewerMode,
      }));
      console.debug("[HostedDisplayViewer] rpc error", {
        projectSlug,
        displaySlug,
        code: parsed.rpcErrorCode ?? parsed.code,
      });
      if (!bundleRef.current) {
        setError(
          resolveViewerLoadErrorMessageForDisplay({
            code: parsed.code,
            display: displayStatusInput,
          }),
        );
        setBundle(null);
      }
      return;
    }

    if (mode === "public" && parsed.display.online_visibility !== "public") {
      setError(
        resolveViewerLoadErrorMessageForDisplay({
          code: "authentication_required",
          display: displayStatusInput,
        }),
      );
      setBundle(null);
      return;
    }

    const snapshot = resolveDisplayRuntimeSnapshot(parsed.canonicalPayload ?? {});

    const payloadFingerprint = fingerprintCanonicalPayloadContent(parsed.canonicalPayload ?? {});

    setDiagnostics((current) => ({
      ...current,
      rpcCode: parsed.code,
      rpcBundleReady: parsed.code === "viewer_ready",
      publishedRevisionId: parsed.display.published_revision_id ?? null,
      htmlLoaded: parsed.htmlContent.length > 0,
      htmlPresent: parsed.htmlContent.length > 0,
      publisherOnline: parsed.publisherOnline,
      sourceConnected: parsed.sourceConnected,
      sourceOffline: parsed.sourceOffline,
      sourceMode: parsed.sourceMode,
      canonicalDataPresent: parsed.canonicalDataPresent,
      dataStale: parsed.dataStale,
      staleReason: parsed.staleReason,
      snapshotAgeSeconds: computeAgeSeconds(parsed.snapshotReceivedAt),
      publisherHeartbeatAgeSeconds: computeAgeSeconds(parsed.publisherLastHeartbeatAt),
      lastPollSucceededAt: new Date().toISOString(),
      pollErrorCategory: null,
      receivedCanonicalRevision: parsed.canonicalRevision,
      receivedPayloadFingerprint: payloadFingerprint,
      lastErrorCategory: null,
      viewerMode,
      ...mapPayloadDiagnostics({
        payload: parsed.canonicalPayload ?? {},
        snapshot,
        revision: parsed.canonicalRevision,
      }),
    }));

    setError(null);
    hasLoadedBundleRef.current = true;
    bundleRef.current = parsed;
    setBundle(parsed);
  }, [displaySlug, displayStatusInput, mode, pollIntervalMs, projectSlug, supabase, viewerMode]);

  useEffect(() => {
    void loadBundle();
    const interval = window.setInterval(() => {
      void loadBundle();
    }, pollIntervalMs);
    return () => window.clearInterval(interval);
  }, [loadBundle, pollIntervalMs]);

  useLayoutEffect(() => {
    function handleMessage(event: MessageEvent) {
      const iframeWindow = iframeRef.current?.contentWindow ?? null;
      const sourceMatched = isHostedViewerMessageFromIframe(event, iframeWindow);
      const originMatched = isAllowedHostedViewerMessageOrigin(
        event.origin,
        window.location.origin,
      );

      if (!sourceMatched || !originMatched) {
        return;
      }

      const generation = iframeGenerationRef.current;

      if (isNeudHostedBridgeBootedMessage(event.data)) {
        const boot = event.data;
        setDiagnostics((current) => ({
          ...current,
          hostedBridgeBooted: true,
          inboundListenerInstalled: boot.inboundListenerInstalled,
          runtimeGlobalPresentAtBoot: boot.runtimeGlobalPresent,
          publishFunctionPresentAtBoot: boot.publishFunctionPresent,
          runtimeGlobalPresent: boot.runtimeGlobalPresent,
          activeIframeGeneration: generation,
          lastErrorCategory: null,
        }));
        handleHostedBridgeBooted(generation);
        return;
      }

      if (isNeudHostedBridgeErrorMessage(event.data)) {
        setDiagnostics((current) => ({
          ...current,
          lastErrorCategory: event.data.errorCategory,
        }));
        return;
      }

      if (isNeudHostedBridgeRejectedMessage(event.data)) {
        setDiagnostics((current) => ({
          ...current,
          lastRejectionReason: event.data.reason,
        }));
        return;
      }

      if (isNeudDataUpdateReceivedMessage(event.data)) {
        const ack = event.data;
        const ackRevision = ack.revision ?? null;
        const ackFingerprint = lastPostedPayloadFingerprintRef.current;
        if (ackRevision != null) {
          const currentAck = lastAcknowledgedCanonicalRevisionRef.current;
          if (currentAck == null || ackRevision >= currentAck) {
            lastAcknowledgedCanonicalRevisionRef.current = ackRevision;
          }
        }
        if (ackFingerprint) {
          lastAcknowledgedPayloadFingerprintRef.current = ackFingerprint;
        }
        if (
          ackRevision === latestRevisionRef.current &&
          ackFingerprint === lastPostedPayloadFingerprintRef.current
        ) {
          clearAckTimers();
        }
        setDiagnostics((current) => ({
          ...current,
          dataUpdateAckReceived: true,
          iframeUpdateReceived: true,
          lastAcknowledgedCanonicalRevision: ackRevision,
          lastAcknowledgedPayloadFingerprint: ackFingerprint,
          runtimeGlobalPresent: ack.runtimeGlobalPresent,
          runtimeSubscribersCount: ack.subscriberCount,
          adapterInputShapeKeys:
            ack.adapterInputShapeKeys && ack.adapterInputShapeKeys.length > 0
              ? ack.adapterInputShapeKeys
              : current.adapterInputShapeKeys,
          runtimeInputNormalized: ack.runtimeInputNormalized ?? current.runtimeInputNormalized,
          lastErrorCategory: null,
        }));
        return;
      }

      if (isNeudRenderStatusMessage(event.data)) {
        const status = event.data;
        const statusRevision = status.revision ?? null;
        if (
          !shouldApplyRevisionStatus({
            statusRevision,
            latestRevision: latestRevisionRef.current,
            lastAppliedRevision: lastRenderedCanonicalRevisionRef.current,
          })
        ) {
          return;
        }
        if (status.renderCompleted && statusRevision != null) {
          lastRenderedCanonicalRevisionRef.current = statusRevision;
          lastRenderedPayloadFingerprintRef.current =
            lastPostedPayloadFingerprintRef.current ?? lastDeliveredFingerprintRef.current;
        }
        setDiagnostics((current) => ({
          ...current,
          renderStatusReceived: true,
          renderedCanonicalRevision: statusRevision,
          lastRenderedPayloadFingerprint:
            lastRenderedPayloadFingerprintRef.current ?? current.lastRenderedPayloadFingerprint,
          adapterSelected: status.adapter,
          streamBidInputReceived: status.inputReceived,
          currentLotResolved: status.currentLotResolved,
          bidResolved: status.bidResolved,
          photosResolvedCount: status.photoCount,
          renderUpdateCompleted: status.renderCompleted,
          renderSkippedReason: status.skipReason,
          renderErrorCategory: status.renderCompleted ? null : status.skipReason,
        }));
        return;
      }

      if (isNeudHostedBridgeStatusMessage(event.data)) {
        const status = event.data;
        setDiagnostics((current) => ({
          ...current,
          iframeUpdateReceived: status.iframeUpdateReceived ?? current.iframeUpdateReceived,
          runtimeSubscribersCount:
            status.runtimeSubscribersCount ?? current.runtimeSubscribersCount,
          lastSubscriberInvocationAt:
            status.lastSubscriberInvocationAt ?? current.lastSubscriberInvocationAt,
          adapterSelected: status.adapterSelected ?? current.adapterSelected,
          adapterInputShapeKeys:
            status.adapterInputShapeKeys && status.adapterInputShapeKeys.length > 0
              ? status.adapterInputShapeKeys
              : current.adapterInputShapeKeys,
          renderUpdateCompleted:
            status.renderUpdateCompleted ?? current.renderUpdateCompleted,
          renderErrorCategory: status.renderErrorCategory ?? current.renderErrorCategory,
          missingRequiredFields:
            status.missingRequiredFields && status.missingRequiredFields.length > 0
              ? status.missingRequiredFields
              : current.missingRequiredFields,
          runtimeInputNormalized:
            status.runtimeInputNormalized ?? current.runtimeInputNormalized,
          hostedPayloadShapeVersion:
            status.payloadShapeVersion ?? current.hostedPayloadShapeVersion,
          streamBidInputReceived:
            status.streamBidInputReceived ?? current.streamBidInputReceived,
          currentLotResolved: status.currentLotResolved ?? current.currentLotResolved,
          bidResolved: status.bidResolved ?? current.bidResolved,
          photosResolvedCount: status.photosResolvedCount ?? current.photosResolvedCount,
          renderSkippedReason: status.renderSkippedReason ?? current.renderSkippedReason,
        }));
        return;
      }

      if (!isNeudDisplayReadyMessage(event.data)) {
        return;
      }

      setDiagnostics((current) => ({
        ...current,
        bridgeReady: true,
        displayReadyReceived: true,
      }));
      logHostedViewerIframeReady({
        sourceMatched,
        originMatched,
        messageType: event.data.type,
        bridgeVersion: HOSTED_RUNTIME_BRIDGE_VERSION,
      });
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [clearAckTimers, handleHostedBridgeBooted]);

  useEffect(() => {
    if (!bundle) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const rawPayload = (bundle.canonicalPayload ?? {}) as Record<string, unknown>;
      let canonicalPayload = rawPayload;
      let photoDiagnostics: Record<string, unknown> = {};

      try {
        const enriched = await resolveStorageObjectIdsViaProxy({
          supabase: createClient(),
          canonicalPayload: rawPayload,
          projectSlug,
          displaySlug,
        });
        canonicalPayload = enriched.payload;
        photoDiagnostics = enriched.diagnostics;
      } catch {
        canonicalPayload = rawPayload;
      }

      if (cancelled) {
        return;
      }

      const snapshot = resolveDisplayRuntimeSnapshot(canonicalPayload);
      const payloadFingerprint = fingerprintCanonicalPayloadContent(canonicalPayload);
      latestCanonicalPayloadRef.current = canonicalPayload;
      latestSnapshotRef.current = snapshot;
      latestRevisionRef.current = bundle.canonicalRevision;

      setDiagnostics((current) => ({
        ...current,
        canonicalDataPresent: bundle.canonicalDataPresent,
        sourceMode: bundle.sourceMode,
        dataStale: bundle.dataStale,
        staleReason: bundle.staleReason,
        snapshotAgeSeconds: computeAgeSeconds(bundle.snapshotReceivedAt),
        publisherHeartbeatAgeSeconds: computeAgeSeconds(bundle.publisherLastHeartbeatAt),
        receivedCanonicalRevision: bundle.canonicalRevision,
        receivedPayloadFingerprint: payloadFingerprint,
        viewerMode,
        ...photoDiagnostics,
        ...mapPayloadDiagnostics({
          payload: canonicalPayload,
          snapshot,
          revision: bundle.canonicalRevision,
        }),
      }));

      if (bootedGenerationRef.current === iframeGenerationRef.current) {
        deliverSnapshotRef.current();
        scheduleBoundedAckRetries(
          iframeGenerationRef.current,
          latestRevisionRef.current,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bundle?.canonicalRevision, bundle?.revisionKey, bundle, scheduleBoundedAckRetries, viewerMode]);

  useEffect(() => {
    if (!bundle || !preparedHtml) {
      return;
    }

    const revisionKey = bundle.revisionKey;
    if (revisionKey !== loadedRevisionRef.current) {
      loadedRevisionRef.current = revisionKey;
      resetIframeHandshakeState(revisionKey);
    }

    setDiagnostics((current) => ({
      ...current,
      iframeWritten: Boolean(preparedHtml),
      bridgeMarkerPresent: preparedHtml.includes("neud-hosted-bridge:v3"),
    }));
  }, [bundle, preparedHtml, resetIframeHandshakeState]);

  useEffect(() => () => clearAckTimers(), [clearAckTimers]);

  useEffect(() => () => clearLayoutRefreshBurstTimers(), [clearLayoutRefreshBurstTimers]);

  useEffect(() => {
    if (!embedded) {
      return;
    }
    const container = canvasContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }

    let debounceTimer: number | null = null;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry?.contentRect.width ?? 0;
      const height = entry?.contentRect.height ?? 0;
      if (width <= 0 || height <= 0) {
        setDiagnostics((current) => ({
          ...current,
          firstPreviewMarqueeFailureStage:
            current.firstPreviewMarqueeFailureStage ?? "preview_collapsed_zero_width",
          firstFailureStage:
            current.firstFailureStage ?? "preview_collapsed_zero_width",
        }));
        return;
      }
      if (debounceTimer != null) {
        window.clearTimeout(debounceTimer);
      }
      debounceTimer = window.setTimeout(() => {
        notifyEmbeddedLayoutReady();
      }, 50);
    });

    observer.observe(container);
    const initialRect = container.getBoundingClientRect();
    if (initialRect.width > 0 && initialRect.height > 0) {
      notifyEmbeddedLayoutReady();
    }
    return () => {
      observer.disconnect();
      if (debounceTimer != null) {
        window.clearTimeout(debounceTimer);
      }
    };
  }, [embedded, notifyEmbeddedLayoutReady, preparedHtml]);

  const handleIframeLoad = useCallback(() => {
    setDiagnostics((current) => ({
      ...current,
      iframeWritten: true,
      iframeDocumentLoaded: true,
      previewExpanded: embedded ? true : current.previewExpanded,
    }));
  }, [embedded]);

  const handleIframeRef = useCallback((node: HTMLIFrameElement | null) => {
    iframeRef.current = node;
    setDiagnostics((current) => ({
      ...current,
      iframeMounted: Boolean(node),
    }));
  }, []);

  const statusNotice = useMemo(() => {
    if (!bundle) {
      return null;
    }
    return resolveViewerStatusNotice({
      sourceOffline: bundle.sourceOffline,
      publisherOnline: bundle.publisherOnline,
      sourceConnected: bundle.sourceConnected,
      sourceMode: bundle.sourceMode,
      dataStale: bundle.dataStale,
      staleReason: bundle.staleReason,
      canonicalDataPresent: bundle.canonicalDataPresent,
      hasResolvedCanonicalSnapshot: Boolean(latestSnapshotRef.current),
    });
  }, [bundle]);

  const aspectRatio =
    bundle?.display.display_width && bundle.display.display_height
      ? `${bundle.display.display_width} / ${bundle.display.display_height}`
      : "16 / 9";

  const statusNoticeClassName =
    statusNotice?.tone === "warning"
      ? "rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100"
      : statusNotice?.tone === "info"
        ? "rounded-md border border-border bg-surface px-4 py-2 text-sm text-muted"
        : "rounded-md border border-border bg-surface px-4 py-2 text-sm text-muted";

  const fullscreenPath = useMemo(
    () => buildHostedFullscreenViewerPath(projectSlug, displaySlug, mode),
    [projectSlug, displaySlug, mode],
  );

  const copyFullscreenUrl = useCallback(async () => {
    setCopyStatus(null);
    try {
      const absoluteUrl =
        buildAbsoluteHostedFullscreenViewerUrl(
          projectSlug,
          displaySlug,
          mode,
          hostedPortalOrigin.origin,
        ) ?? fullscreenPath;
      if (!absoluteUrl) {
        throw new Error("Fullscreen URL unavailable.");
      }
      await navigator.clipboard.writeText(absoluteUrl);
      setCopyStatus("URL copied");
    } catch {
      setCopyStatus("Unable to copy URL.");
    }
  }, [projectSlug, displaySlug, mode, hostedPortalOrigin.origin, fullscreenPath]);

  const copyOutputUrl = copyFullscreenUrl;

  const debugBlock = showDebugPanel ? (
    <div
      className={
        isFullscreenOutput
          ? "relative z-10 border-b border-border bg-surface/90 px-3 py-2 text-xs text-muted"
          : "space-y-2"
      }
    >
      <p className="font-mono text-foreground">
        build {diagnostics.buildLabel} · app {diagnostics.appVersion} · parser{" "}
        {diagnostics.parserVersion} · bridge {diagnostics.bridgeVersion} · shape{" "}
        {diagnostics.localPayloadShapeVersion}
      </p>
      <HostedViewerDiagnosticsPanel
        diagnostics={diagnostics}
        defaultOpen={isFullscreenOutput && showDebugPanel}
      />
    </div>
  ) : null;

  const viewerToolbar = showChrome ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {mode === "private" ? (
        <div>
          <h1 className="text-lg font-semibold text-foreground">{bundle?.display.name}</h1>
          <p className="text-sm text-muted">{bundle?.project?.name ?? bundle?.project?.slug}</p>
        </div>
      ) : (
        <div>
          <h1 className="text-lg font-semibold text-foreground">{bundle?.display.name}</h1>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {copyStatus ? <span className="text-xs text-muted">{copyStatus}</span> : null}
        {fullscreenPath ? (
          <Button
            type="button"
            variant="secondary"
            href={fullscreenPath}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Fullscreen
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={() => void copyOutputUrl()}>
          Copy URL
        </Button>
      </div>
    </div>
  ) : null;

  const viewerCanvasClassName = embedded
    ? "neud-viewer-transparency-grid aspect-video w-full overflow-hidden rounded-md border border-border"
    : isFullscreenOutput
      ? "fixed inset-0 z-0 h-full w-full overflow-hidden bg-transparent"
      : isPortalPreview
        ? mode === "public"
          ? "neud-viewer-transparency-grid min-h-0 w-full flex-1 overflow-hidden"
          : "neud-viewer-transparency-grid w-full overflow-hidden rounded-lg border border-border"
        : "w-full overflow-hidden rounded-lg border border-border bg-black";

  const viewerSurface = preparedHtml ? (
    <div
      ref={canvasContainerRef}
      className={viewerCanvasClassName}
      style={{
        aspectRatio:
          embedded || isFullscreenOutput || mode === "public" ? undefined : aspectRatio,
        minHeight: isFullscreenOutput ? "100vh" : embedded ? undefined : undefined,
        pointerEvents: "auto",
      }}
    >
      <iframe
        key={bundle?.revisionKey ?? "pending"}
        ref={handleIframeRef}
        title={bundle?.display.name ?? "NEUD Display"}
        className="h-full w-full border-0 bg-transparent"
        sandbox="allow-scripts"
        srcDoc={preparedHtml}
        onLoad={handleIframeLoad}
      />
    </div>
  ) : null;

  if (error && !bundleRef.current) {
    return (
      <HostedFullscreenOutputShell active={isFullscreenOutput}>
        <div className={isFullscreenOutput ? "min-h-screen bg-transparent text-foreground" : undefined}>
          {debugBlock}
          <Card className="mx-auto max-w-2xl p-8 text-center text-sm text-muted">{error}</Card>
        </div>
      </HostedFullscreenOutputShell>
    );
  }

  if (!hasLoadedBundleRef.current && (!bundle || !preparedHtml)) {
    return (
      <HostedFullscreenOutputShell active={isFullscreenOutput}>
        <div className={isFullscreenOutput ? "min-h-screen bg-transparent text-foreground" : undefined}>
          {debugBlock}
          <Card className="mx-auto max-w-2xl p-8 text-center text-sm text-muted">
            Loading display…
          </Card>
        </div>
      </HostedFullscreenOutputShell>
    );
  }

  return (
    <HostedFullscreenOutputShell active={isFullscreenOutput}>
      <div
        className={
          isFullscreenOutput
            ? "fixed inset-0 flex flex-col bg-transparent"
            : isPortalPreview && mode === "public"
              ? "flex min-h-dvh flex-col space-y-4"
              : "space-y-4"
        }
      >
        {viewerToolbar}
        {debugBlock}
        {showChrome && statusNotice ? (
          <div className={statusNoticeClassName}>
            <p className="font-medium text-foreground">{statusNotice.title}</p>
            <p>{statusNotice.message}</p>
          </div>
        ) : null}
        {error && bundleRef.current ? (
          <div className={statusNoticeClassName}>
            <p className="font-medium text-foreground">Viewer refresh issue</p>
            <p>{error}</p>
          </div>
        ) : null}
        {viewerSurface}
      </div>
    </HostedFullscreenOutputShell>
  );
}
