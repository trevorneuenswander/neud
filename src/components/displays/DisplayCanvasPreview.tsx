"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_DISPLAY_HEIGHT,
  DEFAULT_DISPLAY_WIDTH,
} from "@/lib/displays/display-size";
import { isDisplayBridgeAckMessage } from "@/lib/displays/display-preview-bridge";
import {
  publishDesktopPreviewDiagnostics,
  trySendStreamTickerLayoutRefresh,
  type DesktopPreviewDiagnostics,
  type DesktopPreviewFailureStage,
} from "@/lib/displays/desktop-preview-stream-ticker-layout";

export type DisplayCanvasPreviewProps = {
  displayWidth?: number;
  displayHeight?: number;
  title: string;
  label?: string;
  viewerUrl?: string;
  srcDoc?: string;
  sandbox?: string;
  iframeKey?: string;
  hasActiveRevision?: boolean;
  iframePointerEvents?: "none" | "auto";
  onIframeLoad?: () => void;
  onIframeError?: () => void;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  displayId?: string;
  onBridgeAck?: () => void;
  previewOpen?: boolean;
  enableStreamTickerLayoutRefresh?: boolean;
  iframeRevisionId?: string | null;
};

function buildPreviewUrl(viewerUrl: string, revisionId?: string | null): string {
  try {
    const url = new URL(
      viewerUrl,
      typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1",
    );
    url.searchParams.set("preview", "1");
    if (revisionId) {
      url.searchParams.set("revision", revisionId);
    }
    return url.toString();
  } catch {
    const separator = viewerUrl.includes("?") ? "&" : "?";
    const revisionSuffix = revisionId
      ? `&revision=${encodeURIComponent(revisionId)}`
      : "";
    return `${viewerUrl}${separator}preview=1${revisionSuffix}`;
  }
}

export function DisplayCanvasPreview({
  displayWidth = DEFAULT_DISPLAY_WIDTH,
  displayHeight = DEFAULT_DISPLAY_HEIGHT,
  title,
  label,
  viewerUrl,
  srcDoc,
  sandbox,
  iframeKey,
  hasActiveRevision = true,
  iframePointerEvents = "none",
  onIframeLoad,
  onIframeError,
  iframeRef,
  displayId,
  onBridgeAck,
  previewOpen = true,
  enableStreamTickerLayoutRefresh = false,
  iframeRevisionId = null,
}: DisplayCanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalIframeRef = useRef<HTMLIFrameElement>(null);
  const resolvedIframeRef = iframeRef ?? internalIframeRef;
  const [scale, setScale] = useState(0.2);
  const previewLayoutReadyRef = useRef(false);
  const oneTimeLayoutRefreshSentRef = useRef(false);
  const iframeLoadedRef = useRef(false);
  const bridgeAckRef = useRef(false);
  const iframeRecreatedCountRef = useRef(0);
  const prevIframeKeyRef = useRef(iframeKey);
  const layoutReadySendCountRef = useRef(0);
  const firstFailureStageRef = useRef<DesktopPreviewFailureStage | null>(null);
  const canonicalPayloadDeliveredRef = useRef(false);

  const recordFailureStage = useCallback((stage: DesktopPreviewFailureStage) => {
    if (firstFailureStageRef.current == null || firstFailureStageRef.current === "none") {
      firstFailureStageRef.current = stage;
    }
  }, []);

  const publishDiagnostics = useCallback(() => {
    if (!enableStreamTickerLayoutRefresh) {
      return;
    }

    const node = containerRef.current;
    const diagnostics: DesktopPreviewDiagnostics = {
      previewOpen,
      containerWidth: node?.clientWidth ?? 0,
      containerHeight: node?.clientHeight ?? 0,
      iframeMounted: Boolean(resolvedIframeRef.current),
      iframeRevisionId,
      iframeRecreatedCount: iframeRecreatedCountRef.current,
      nonzeroLayoutDetected: previewLayoutReadyRef.current,
      layoutReadySent: oneTimeLayoutRefreshSentRef.current,
      layoutReadySendCount: layoutReadySendCountRef.current,
      canonicalPayloadDelivered: bridgeAckRef.current || canonicalPayloadDeliveredRef.current,
      firstFailureStage: firstFailureStageRef.current,
    };
    publishDesktopPreviewDiagnostics(diagnostics);
  }, [enableStreamTickerLayoutRefresh, iframeRevisionId, previewOpen, resolvedIframeRef]);

  const attemptLayoutRefreshOnce = useCallback(
    (reason: string) => {
      if (!enableStreamTickerLayoutRefresh || !previewOpen) {
        return false;
      }
      if (oneTimeLayoutRefreshSentRef.current) {
        return false;
      }
      if (!iframeLoadedRef.current) {
        recordFailureStage("iframe_not_resized");
        return false;
      }
      if (!previewLayoutReadyRef.current) {
        const node = containerRef.current;
        if (!node || node.clientWidth <= 0 || node.clientHeight <= 0) {
          recordFailureStage("zero_width_initial_measurement");
        } else {
          recordFailureStage("layout_ready_not_sent");
        }
        return false;
      }
      if (onBridgeAck && !bridgeAckRef.current) {
        recordFailureStage("canonical_payload_delivered_too_early");
        return false;
      }

      const iframe = resolvedIframeRef.current;
      const contentWindow = iframe?.contentWindow ?? null;
      if (!contentWindow) {
        recordFailureStage("iframe_not_resized");
        publishDiagnostics();
        return false;
      }

      const sent = trySendStreamTickerLayoutRefresh(contentWindow, reason);
      if (!sent) {
        recordFailureStage("desktop_transform_missing_hook");
        publishDiagnostics();
        return false;
      }

      oneTimeLayoutRefreshSentRef.current = true;
      layoutReadySendCountRef.current += 1;
      if (firstFailureStageRef.current == null) {
        firstFailureStageRef.current = "none";
      }
      publishDiagnostics();
      return true;
    },
    [
      enableStreamTickerLayoutRefresh,
      onBridgeAck,
      previewOpen,
      publishDiagnostics,
      recordFailureStage,
      resolvedIframeRef,
    ],
  );

  const notifyPreviewLayoutReady = useCallback(() => {
    if (!enableStreamTickerLayoutRefresh || !previewOpen || previewLayoutReadyRef.current) {
      return;
    }

    const node = containerRef.current;
    if (!node || node.clientWidth <= 0 || node.clientHeight <= 0) {
      if (!previewOpen) {
        recordFailureStage("preview_mounted_hidden");
      }
      return;
    }

    previewLayoutReadyRef.current = true;
    publishDiagnostics();
    window.setTimeout(() => {
      attemptLayoutRefreshOnce("preview_layout_ready");
    }, 0);
  }, [
    attemptLayoutRefreshOnce,
    enableStreamTickerLayoutRefresh,
    previewOpen,
    publishDiagnostics,
    recordFailureStage,
  ]);

  useEffect(() => {
    if (prevIframeKeyRef.current !== iframeKey) {
      if (prevIframeKeyRef.current !== undefined) {
        iframeRecreatedCountRef.current += 1;
        recordFailureStage("iframe_recreated_by_state_update");
      }
      prevIframeKeyRef.current = iframeKey;
      previewLayoutReadyRef.current = false;
      oneTimeLayoutRefreshSentRef.current = false;
      iframeLoadedRef.current = false;
      bridgeAckRef.current = false;
      canonicalPayloadDeliveredRef.current = false;
      firstFailureStageRef.current = null;
      layoutReadySendCountRef.current = 0;
    }
  }, [iframeKey, recordFailureStage]);

  useEffect(() => {
    if (!previewOpen) {
      previewLayoutReadyRef.current = false;
      oneTimeLayoutRefreshSentRef.current = false;
      iframeLoadedRef.current = false;
      bridgeAckRef.current = false;
      canonicalPayloadDeliveredRef.current = false;
      firstFailureStageRef.current = null;
      layoutReadySendCountRef.current = 0;
      if (enableStreamTickerLayoutRefresh) {
        recordFailureStage("preview_mounted_hidden");
        publishDiagnostics();
      }
    }
  }, [
    enableStreamTickerLayoutRefresh,
    previewOpen,
    publishDiagnostics,
    recordFailureStage,
  ]);

  useEffect(() => {
    if (!onBridgeAck) {
      return;
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!isDisplayBridgeAckMessage(event.data, displayId)) {
        return;
      }
      bridgeAckRef.current = true;
      canonicalPayloadDeliveredRef.current = true;
      publishDiagnostics();
      attemptLayoutRefreshOnce("bridge_ack");
      onBridgeAck?.();
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    attemptLayoutRefreshOnce,
    displayId,
    onBridgeAck,
    publishDiagnostics,
  ]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateScale = () => {
      const widthScale = node.clientWidth / displayWidth;
      const heightScale = node.clientHeight / displayHeight;
      setScale(Math.min(widthScale, heightScale, 1));
      if (enableStreamTickerLayoutRefresh && previewOpen) {
        notifyPreviewLayoutReady();
      }
      publishDiagnostics();
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    displayHeight,
    displayWidth,
    enableStreamTickerLayoutRefresh,
    notifyPreviewLayoutReady,
    previewOpen,
    publishDiagnostics,
  ]);

  useEffect(() => {
    publishDiagnostics();
  }, [publishDiagnostics, scale]);

  const handleIframeLoad = useCallback(() => {
    iframeLoadedRef.current = true;
    publishDiagnostics();
    notifyPreviewLayoutReady();
    attemptLayoutRefreshOnce("iframe_load");
    onIframeLoad?.();
  }, [
    attemptLayoutRefreshOnce,
    notifyPreviewLayoutReady,
    onIframeLoad,
    publishDiagnostics,
  ]);

  if (!hasActiveRevision) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-md border border-border bg-background/70 px-4 text-center text-sm text-muted">
        Preview unavailable because this display has no active HTML version.
      </div>
    );
  }

  const scaledWidth = displayWidth * scale;
  const scaledHeight = displayHeight * scale;
  const sizeLabel = label ?? `Preview · ${displayWidth}×${displayHeight}`;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{sizeLabel}</p>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-md border border-border"
        style={{
          aspectRatio: `${displayWidth} / ${displayHeight}`,
          backgroundColor: "#d9d9d9",
          backgroundImage:
            "linear-gradient(45deg, #cfcfcf 25%, transparent 25%), linear-gradient(-45deg, #cfcfcf 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cfcfcf 75%), linear-gradient(-45deg, transparent 75%, #cfcfcf 75%)",
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
        }}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: scaledWidth,
            height: scaledHeight,
            transform: "translate(-50%, -50%)",
          }}
        >
          <iframe
            key={iframeKey}
            ref={resolvedIframeRef}
            title={`${title} preview`}
            src={srcDoc ? undefined : viewerUrl ? buildPreviewUrl(viewerUrl) : undefined}
            srcDoc={srcDoc}
            sandbox={sandbox}
            className="border-0 bg-transparent"
            style={{
              width: `${displayWidth}px`,
              height: `${displayHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              pointerEvents: iframePointerEvents,
              background: "transparent",
              backgroundColor: "transparent",
            }}
            onLoad={handleIframeLoad}
            onError={onIframeError}
          />
        </div>
      </div>
    </div>
  );
}
