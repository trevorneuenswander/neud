"use client";

import { DisplayCanvasPreview } from "@/components/displays/DisplayCanvasPreview";

type DisplayPreviewPanelProps = {
  viewerUrl: string;
  title: string;
  displayWidth?: number;
  displayHeight?: number;
  iframeKey?: string;
  hasActiveRevision?: boolean;
  enabled?: boolean;
  keepPreviewWhenDisabled?: boolean;
  displayId?: string;
  onBridgeAck?: () => void;
  previewOpen?: boolean;
  enableStreamTickerLayoutRefresh?: boolean;
  iframeRevisionId?: string | null;
};

function DisplayPreviewDisconnectedState() {
  return (
    <div className="flex aspect-video items-center justify-center rounded-md border border-border bg-background/70 px-4 text-center text-sm text-muted">
      <div>
        <p className="font-medium text-foreground">Display data is disconnected.</p>
        <p className="mt-1">Enable this display to connect the preview.</p>
      </div>
    </div>
  );
}

export function DisplayPreviewPanel({
  viewerUrl,
  title,
  displayWidth = 1920,
  displayHeight = 1080,
  iframeKey,
  hasActiveRevision = true,
  enabled = true,
  keepPreviewWhenDisabled = false,
  displayId,
  onBridgeAck,
  previewOpen = true,
  enableStreamTickerLayoutRefresh = false,
  iframeRevisionId = null,
}: DisplayPreviewPanelProps) {
  if (!enabled && !keepPreviewWhenDisabled) {
    return <DisplayPreviewDisconnectedState />;
  }

  return (
    <div className="space-y-2">
      {!enabled ? (
        <p className="text-xs text-red-400">Polling paused. Last rendered values remain visible.</p>
      ) : null}
      <DisplayCanvasPreview
      viewerUrl={viewerUrl}
      title={title}
      displayWidth={displayWidth}
      displayHeight={displayHeight}
      iframeKey={iframeKey}
      hasActiveRevision={hasActiveRevision}
      iframePointerEvents="auto"
        displayId={displayId}
        onBridgeAck={onBridgeAck}
        previewOpen={previewOpen}
        enableStreamTickerLayoutRefresh={enableStreamTickerLayoutRefresh}
        iframeRevisionId={iframeRevisionId}
      />
    </div>
  );
}

export { DisplayPreviewDisconnectedState };
