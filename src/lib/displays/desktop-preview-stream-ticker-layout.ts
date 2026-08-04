import { buildNeudLayoutRefreshMessage } from "@/lib/hosted/hosted-display-runtime-bridge";

export type DesktopPreviewFailureStage =
  | "preview_mounted_hidden"
  | "zero_width_initial_measurement"
  | "scale_not_applied"
  | "iframe_not_resized"
  | "layout_ready_not_sent"
  | "canonical_payload_delivered_too_early"
  | "iframe_recreated_by_state_update"
  | "marquee_cancelled_by_preview_update"
  | "desktop_transform_missing_hook"
  | "desktop_revision_stale"
  | "none";

export type DesktopPreviewDiagnostics = {
  previewOpen: boolean;
  containerWidth: number;
  containerHeight: number;
  iframeMounted: boolean;
  iframeRevisionId: string | null;
  iframeRecreatedCount: number;
  nonzeroLayoutDetected: boolean;
  layoutReadySent: boolean;
  layoutReadySendCount: number;
  canonicalPayloadDelivered: boolean;
  firstFailureStage: DesktopPreviewFailureStage | null;
};

declare global {
  interface Window {
    __neudDesktopPreviewDiagnostics?: DesktopPreviewDiagnostics;
  }
}

export function publishDesktopPreviewDiagnostics(
  diagnostics: DesktopPreviewDiagnostics,
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.__neudDesktopPreviewDiagnostics = diagnostics;
}

export function trySendStreamTickerLayoutRefresh(
  contentWindow: Window | null,
  reason: string,
  targetOrigin = "*",
): boolean {
  if (!contentWindow) {
    return false;
  }

  try {
    const target = contentWindow as Window & {
      __NEUD_VIEWER_MODE__?: string;
      __neudRefreshStreamTickerLayout?: (refreshReason?: string) => void;
    };
    target.__NEUD_VIEWER_MODE__ = "desktop-preview";
    if (typeof target.__neudRefreshStreamTickerLayout === "function") {
      target.__neudRefreshStreamTickerLayout(reason);
      return true;
    }
    contentWindow.postMessage(buildNeudLayoutRefreshMessage(reason), targetOrigin);
    return true;
  } catch {
    return false;
  }
}
