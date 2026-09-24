import {
  resolveHostedDisplayHelperText,
  resolveHostedDisplayConnectionStatus,
  resolvePortalConnected,
  type HostedDisplayStatusInput,
} from "@/lib/hosted/hosted-display-connection-status";

export type HostedDisplayStatusBadge = {
  label: string;
  tone: "success" | "warning" | "danger" | "muted";
  detail?: string;
};

export function resolveHostedDisplayStatusBadge(input: {
  publisherOnline: boolean | null;
  sourceOffline: boolean | null;
  sourceConnected: boolean | null;
  canonicalDataPresent: boolean | null;
  pollError: boolean;
  hasLoadedBundle: boolean;
  viewerRpcCode?: string | null;
  display?: HostedDisplayStatusInput | null;
}): HostedDisplayStatusBadge {
  const displayInput: HostedDisplayStatusInput = {
    displayEnabled: input.display?.displayEnabled ?? true,
    onlineViewerEnabled: input.display?.onlineViewerEnabled ?? true,
    visibility: input.display?.visibility ?? "private",
    publishedRevisionPresent: input.display?.publishedRevisionPresent ?? true,
    publisherOnline: input.publisherOnline,
    viewerRpcCode: input.viewerRpcCode ?? (input.pollError ? "temporary_cloud_error" : null),
    htmlPresent: input.display?.htmlPresent ?? null,
    displayExists: input.display?.displayExists,
    authorized: input.display?.authorized,
    publishError: input.display?.publishError,
  };

  const portalConnected = resolvePortalConnected({
    onlineViewerEnabled: displayInput.onlineViewerEnabled,
    publisherOnline: input.publisherOnline,
    visibility: displayInput.visibility,
    portalSessionPresent: displayInput.portalSessionPresent,
    viewerRpcCode: displayInput.viewerRpcCode,
    publishedRevisionPresent: displayInput.publishedRevisionPresent,
    authenticatedViewerAuthorized: displayInput.authenticatedViewerAuthorized,
  });

  if (input.pollError && input.hasLoadedBundle) {
    return {
      label: portalConnected ? "Connected" : "Disconnected",
      tone: portalConnected ? "success" : "danger",
      detail: "The viewer could not refresh, but the last good display is still shown.",
    };
  }

  if (input.pollError && !input.hasLoadedBundle) {
    const connectionStatus = resolveHostedDisplayConnectionStatus(displayInput);
    return {
      label: "Disconnected",
      tone: "danger",
      detail:
        resolveHostedDisplayHelperText(displayInput, connectionStatus) ??
        "The viewer could not load this display.",
    };
  }

  if (portalConnected) {
    if (input.sourceConnected === false) {
      return {
        label: "Connected",
        tone: "success",
        detail:
          "Publisher online. Data source disconnected; showing latest available data.",
      };
    }

    return {
      label: "Connected",
      tone: "success",
    };
  }

  if (input.hasLoadedBundle || input.publisherOnline !== null) {
    const connectionStatus = resolveHostedDisplayConnectionStatus(displayInput);
    return {
      label: "Disconnected",
      tone: "danger",
      detail: resolveHostedDisplayHelperText(displayInput, connectionStatus) ?? undefined,
    };
  }

  return {
    label: "Checking…",
    tone: "muted",
    detail: "Checking publisher connectivity.",
  };
}
