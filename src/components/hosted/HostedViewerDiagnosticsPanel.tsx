"use client";

import { useState } from "react";
import type { HostedViewerStageDiagnostics } from "@/lib/hosted/hosted-viewer-runtime";

type HostedViewerDiagnosticsPanelProps = {
  diagnostics: HostedViewerStageDiagnostics;
  defaultOpen?: boolean;
};

function yesNo(value: boolean | null | undefined): string {
  if (value == null) {
    return "—";
  }
  return value ? "yes" : "no";
}

export function HostedViewerDiagnosticsPanel({
  diagnostics,
  defaultOpen = false,
}: HostedViewerDiagnosticsPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border border-border bg-surface text-xs">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left font-medium text-foreground"
        onClick={() => setOpen((value) => !value)}
      >
        Viewer diagnostics
        <span className="text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <dl className="grid gap-2 border-t border-border px-3 py-3 text-muted sm:grid-cols-2">
          <div>
            <dt>Polling active</dt>
            <dd className="text-foreground">{yesNo(diagnostics.pollingActive)}</dd>
          </div>
          <div>
            <dt>Polling interval (ms)</dt>
            <dd className="font-mono text-foreground">{diagnostics.pollingIntervalMs ?? "—"}</dd>
          </div>
          <div>
            <dt>Last poll attempted</dt>
            <dd className="font-mono text-foreground">{diagnostics.lastPollAttemptedAt ?? "—"}</dd>
          </div>
          <div>
            <dt>Last poll succeeded</dt>
            <dd className="font-mono text-foreground">{diagnostics.lastPollSucceededAt ?? "—"}</dd>
          </div>
          <div>
            <dt>Received canonical revision</dt>
            <dd className="font-mono text-foreground">{diagnostics.receivedCanonicalRevision ?? "—"}</dd>
          </div>
          <div>
            <dt>Last posted revision</dt>
            <dd className="font-mono text-foreground">{diagnostics.lastDataRevisionSent ?? "—"}</dd>
          </div>
          <div>
            <dt>Last ack revision</dt>
            <dd className="font-mono text-foreground">
              {diagnostics.lastAcknowledgedCanonicalRevision ?? "—"}
            </dd>
          </div>
          <div>
            <dt>Last render revision</dt>
            <dd className="font-mono text-foreground">{diagnostics.renderedCanonicalRevision ?? "—"}</dd>
          </div>
          <div>
            <dt>Payload fingerprint</dt>
            <dd className="font-mono text-foreground">{diagnostics.receivedPayloadFingerprint ?? "—"}</dd>
          </div>
          <div>
            <dt>Viewer mode</dt>
            <dd className="font-mono text-foreground">{diagnostics.viewerMode ?? "—"}</dd>
          </div>
          <div>
            <dt>Poll error category</dt>
            <dd className="font-mono text-foreground">{diagnostics.pollErrorCategory ?? "—"}</dd>
          </div>
          <div>
            <dt>RPC bundle ready</dt>
            <dd className="text-foreground">{yesNo(diagnostics.rpcBundleReady)}</dd>
          </div>
          <div>
            <dt>HTML present</dt>
            <dd className="text-foreground">{yesNo(diagnostics.htmlPresent)}</dd>
          </div>
          <div>
            <dt>Bridge marker v3</dt>
            <dd className="text-foreground">{yesNo(diagnostics.bridgeMarkerPresent)}</dd>
          </div>
          <div>
            <dt>Generic display READY received</dt>
            <dd className="text-foreground">{yesNo(diagnostics.displayReadyReceived)}</dd>
          </div>
          <div>
            <dt>Hosted inbound bridge booted</dt>
            <dd className="text-foreground">{yesNo(diagnostics.hostedBridgeBooted)}</dd>
          </div>
          <div>
            <dt>Inbound listener installed</dt>
            <dd className="text-foreground">{yesNo(diagnostics.inboundListenerInstalled)}</dd>
          </div>
          <div>
            <dt>Runtime global present at boot</dt>
            <dd className="text-foreground">{yesNo(diagnostics.runtimeGlobalPresentAtBoot)}</dd>
          </div>
          <div>
            <dt>_publish present at boot</dt>
            <dd className="text-foreground">{yesNo(diagnostics.publishFunctionPresentAtBoot)}</dd>
          </div>
          <div>
            <dt>Active iframe generation</dt>
            <dd className="font-mono text-foreground">{diagnostics.activeIframeGeneration}</dd>
          </div>
          <div>
            <dt>Canonical payload present</dt>
            <dd className="text-foreground">{yesNo(diagnostics.canonicalPayloadPresent)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt>Canonical top-level keys</dt>
            <dd className="break-all font-mono text-foreground">
              {diagnostics.payloadTopLevelKeys.length > 0
                ? diagnostics.payloadTopLevelKeys.join(", ")
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Iframe mounted</dt>
            <dd className="text-foreground">{yesNo(diagnostics.iframeMounted)}</dd>
          </div>
          <div>
            <dt>Iframe document loaded</dt>
            <dd className="text-foreground">{yesNo(diagnostics.iframeDocumentLoaded)}</dd>
          </div>
          <div>
            <dt>Data update attempts</dt>
            <dd className="font-mono text-foreground">{diagnostics.dataUpdateAttempts}</dd>
          </div>
          <div>
            <dt>Last message posted</dt>
            <dd className="font-mono text-foreground">
              {diagnostics.lastMessagePostedType
                ? `${diagnostics.lastMessagePostedType}${
                    diagnostics.lastMessagePostedRevision != null
                      ? ` · rev ${diagnostics.lastMessagePostedRevision}`
                      : ""
                  }`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Last rejection reason</dt>
            <dd className="font-mono text-foreground">{diagnostics.lastRejectionReason ?? "—"}</dd>
          </div>
          <div>
            <dt>DATA_UPDATE ack received</dt>
            <dd className="text-foreground">{yesNo(diagnostics.dataUpdateAckReceived)}</dd>
          </div>
          <div>
            <dt>RENDER_STATUS received</dt>
            <dd className="text-foreground">{yesNo(diagnostics.renderStatusReceived)}</dd>
          </div>
          <div>
            <dt>Iframe update received</dt>
            <dd className="text-foreground">{yesNo(diagnostics.iframeUpdateReceived)}</dd>
          </div>
          <div>
            <dt>Runtime global present</dt>
            <dd className="text-foreground">{yesNo(diagnostics.runtimeGlobalPresent)}</dd>
          </div>
          <div>
            <dt>Runtime subscriber count</dt>
            <dd className="font-mono text-foreground">
              {diagnostics.runtimeSubscribersCount ?? "—"}
            </dd>
          </div>
          <div>
            <dt>Stream Bid input received</dt>
            <dd className="text-foreground">{yesNo(diagnostics.streamBidInputReceived)}</dd>
          </div>
          <div>
            <dt>Current lot resolved</dt>
            <dd className="text-foreground">{yesNo(diagnostics.currentLotResolved)}</dd>
          </div>
          <div>
            <dt>Bid resolved</dt>
            <dd className="text-foreground">{yesNo(diagnostics.bidResolved)}</dd>
          </div>
          <div>
            <dt>Photo count</dt>
            <dd className="font-mono text-foreground">{diagnostics.photosResolvedCount ?? "—"}</dd>
          </div>
          <div>
            <dt>Render completed</dt>
            <dd className="text-foreground">{yesNo(diagnostics.renderUpdateCompleted)}</dd>
          </div>
          <div>
            <dt>Render skipped reason</dt>
            <dd className="font-mono text-foreground">{diagnostics.renderSkippedReason ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt>Normalized snapshot keys</dt>
            <dd className="break-all font-mono text-foreground">
              {diagnostics.normalizedSnapshotKeys.length > 0
                ? diagnostics.normalizedSnapshotKeys.join(", ")
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Payload current is object</dt>
            <dd className="text-foreground">{yesNo(diagnostics.payloadCurrentIsObject)}</dd>
          </div>
          <div>
            <dt>Payload current lot present</dt>
            <dd className="text-foreground">{yesNo(diagnostics.payloadCurrentLotPresent)}</dd>
          </div>
          <div>
            <dt>Payload bid field present</dt>
            <dd className="text-foreground">{yesNo(diagnostics.payloadBidFieldPresent)}</dd>
          </div>
          <div>
            <dt>Payload photo count</dt>
            <dd className="font-mono text-foreground">{diagnostics.payloadPhotoCount}</dd>
          </div>
          <div>
            <dt>Runtime input normalized</dt>
            <dd className="text-foreground">{yesNo(diagnostics.runtimeInputNormalized)}</dd>
          </div>
          <div>
            <dt>Last error category</dt>
            <dd className="font-mono text-foreground">{diagnostics.lastErrorCategory ?? "—"}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
