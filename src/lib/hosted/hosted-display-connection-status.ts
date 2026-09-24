export type HostedDisplayPublisherFailureStage =
  | "no_cloud_session"
  | "publishing_manager_not_running"
  | "heartbeat_timer_missing"
  | "lease_missing"
  | "lease_expired"
  | "instance_id_mismatch"
  | "project_publishing_disabled"
  | "no_eligible_online_displays"
  | "viewer_bundle_stale"
  | "viewer_bundle_mapping_wrong"
  | "portal_status_mapping_wrong"
  | "none";

export type HostedDisplayConnectionStatus =
  | "connected"
  | "disconnected"
  | "viewer_off"
  | "waiting_for_publication"
  | "unavailable"
  | "access_denied"
  | "authentication_required";

export type HostedDisplayFailureStage =
  | "display_not_synced"
  | "online_viewer_off"
  | "no_published_revision"
  | "revision_not_synced"
  | "html_missing"
  | "display_ineligible"
  | "authorization_denied"
  | "viewer_rpc_failed"
  | "route_mapping_failed"
  | "unsupported_display_type"
  | "publisher_offline"
  | "none";

export type HostedDisplayStatusInput = {
  displayExists?: boolean;
  displayEnabled: boolean;
  onlineViewerEnabled: boolean;
  visibility: "private" | "public";
  publishedRevisionPresent: boolean;
  onlinePublishedRevisionPresent?: boolean;
  htmlPresent?: boolean | null;
  authorized?: boolean;
  portalSessionPresent?: boolean;
  authenticatedViewerAuthorized?: boolean | null;
  publisherOnline: boolean | null;
  leasePresent?: boolean | null;
  heartbeatFresh?: boolean | null;
  viewerRpcCode?: string | null;
  publishError?: string | null;
};

export type ResolvedHostedDisplayStatus = {
  connectionStatus: HostedDisplayConnectionStatus;
  connectivityLabel: "Connected" | "Disconnected" | "Checking…";
  connectivityTone: "success" | "danger" | "muted";
  portalConnected: boolean;
  helperText: string | null;
  failureStage: HostedDisplayFailureStage;
  canOpenViewer: boolean;
  canCopyUrl: boolean;
  shouldPollBundle: boolean;
};

/** Connected means Online Viewer is on and the viewer bundle reports a live publisher. */
export function resolvePortalConnected(input: {
  onlineViewerEnabled: boolean;
  publisherOnline: boolean | null;
  visibility?: "private" | "public";
  portalSessionPresent?: boolean;
  viewerRpcCode?: string | null;
  publishedRevisionPresent?: boolean;
  authenticatedViewerAuthorized?: boolean | null;
}): boolean {
  if (input.onlineViewerEnabled !== true) {
    return false;
  }
  if (input.publisherOnline === true) {
    return true;
  }
  if (
    input.visibility === "private" &&
    input.portalSessionPresent &&
    input.viewerRpcCode === "viewer_ready" &&
    input.publishedRevisionPresent !== false &&
    input.authenticatedViewerAuthorized !== false
  ) {
    return true;
  }
  return false;
}

export function resolveViewerRenderable(input: {
  viewerRpcCode?: string | null;
  htmlPresent?: boolean | null;
}): boolean {
  return input.viewerRpcCode === "viewer_ready" && input.htmlPresent !== false;
}

export function resolveHostedDisplayFailureStage(
  input: HostedDisplayStatusInput,
): HostedDisplayFailureStage {
  if (input.displayExists === false) {
    return "display_not_synced";
  }
  if (!input.onlineViewerEnabled) {
    return "online_viewer_off";
  }
  if (!input.displayEnabled) {
    return "display_ineligible";
  }
  if (!input.publishedRevisionPresent) {
    return "no_published_revision";
  }
  if (input.viewerRpcCode === "authentication_required") {
    if (input.visibility === "private" && input.portalSessionPresent) {
      return "viewer_rpc_failed";
    }
    return "authorization_denied";
  }
  if (input.viewerRpcCode === "not_found") {
    return input.authorized === false ? "authorization_denied" : "display_ineligible";
  }
  if (input.viewerRpcCode === "not_published") {
    return "no_published_revision";
  }
  if (input.viewerRpcCode && input.viewerRpcCode !== "viewer_ready") {
    return "viewer_rpc_failed";
  }
  if (input.htmlPresent === false) {
    return "html_missing";
  }
  if (input.onlinePublishedRevisionPresent === false) {
    return "revision_not_synced";
  }
  if (input.publisherOnline === false) {
    return "publisher_offline";
  }
  if (input.viewerRpcCode === "viewer_ready" && input.publisherOnline === true) {
    return "none";
  }
  if (
    input.publishedRevisionPresent &&
    input.displayEnabled &&
    input.onlineViewerEnabled &&
    input.publisherOnline === true
  ) {
    return "none";
  }
  return "none";
}

export function resolveHostedDisplayConnectionStatus(
  input: HostedDisplayStatusInput,
): HostedDisplayConnectionStatus {
  if (input.displayExists === false) {
    return "unavailable";
  }
  if (input.authorized === false) {
    return "access_denied";
  }
  if (!input.onlineViewerEnabled) {
    return "viewer_off";
  }
  if (!input.displayEnabled) {
    return "unavailable";
  }
  if (!input.publishedRevisionPresent) {
    return "waiting_for_publication";
  }
  if (input.viewerRpcCode === "authentication_required") {
    if (input.visibility === "private") {
      return "authentication_required";
    }
    return "access_denied";
  }
  if (input.viewerRpcCode === "not_found") {
    return "access_denied";
  }
  if (input.viewerRpcCode === "not_published") {
    return "waiting_for_publication";
  }
  if (input.viewerRpcCode && input.viewerRpcCode !== "viewer_ready") {
    return "unavailable";
  }
  if (input.publisherOnline === true) {
    return "connected";
  }
  if (input.publisherOnline === false) {
    return "disconnected";
  }
  return "disconnected";
}

export function resolveHostedDisplayHelperText(
  input: HostedDisplayStatusInput,
  connectionStatus: HostedDisplayConnectionStatus,
): string | null {
  if (input.publishError?.trim()) {
    return "Publish error";
  }
  if (!input.onlineViewerEnabled) {
    return "Turn on Online Viewer in the desktop app.";
  }
  if (!input.displayEnabled && input.onlineViewerEnabled) {
    return "Enable the display in the desktop app before using it online.";
  }
  if (connectionStatus === "waiting_for_publication" || !input.publishedRevisionPresent) {
    return "Waiting for first publication";
  }
  if (connectionStatus === "authentication_required") {
    return input.portalSessionPresent
      ? "Restoring your viewer session…"
      : "Sign in to view this private display.";
  }
  if (connectionStatus === "access_denied") {
    return "You do not have access to this display.";
  }
  if (input.displayExists === false) {
    return "Display could not be found.";
  }
  if (
    input.onlineViewerEnabled &&
    input.publishedRevisionPresent &&
    input.publisherOnline === false
  ) {
    return "No active desktop publisher is connected.";
  }
  if (connectionStatus === "unavailable") {
    if (input.viewerRpcCode === "temporary_cloud_error") {
      return "The online viewer is temporarily unavailable. Try again shortly.";
    }
    return "This display is not available online yet.";
  }
  return null;
}

export function resolveHostedDisplayStatus(
  input: HostedDisplayStatusInput,
): ResolvedHostedDisplayStatus {
  const connectionStatus = resolveHostedDisplayConnectionStatus(input);
  const failureStage = resolveHostedDisplayFailureStage(input);
  const helperText = resolveHostedDisplayHelperText(input, connectionStatus);
  const portalConnected = resolvePortalConnected({
    onlineViewerEnabled: input.onlineViewerEnabled,
    publisherOnline: input.publisherOnline,
    visibility: input.visibility,
    portalSessionPresent: input.portalSessionPresent,
    viewerRpcCode: input.viewerRpcCode,
    publishedRevisionPresent: input.publishedRevisionPresent,
    authenticatedViewerAuthorized: input.authenticatedViewerAuthorized,
  });
  const viewerRenderable = resolveViewerRenderable(input);

  const publishedAndEligible =
    input.displayEnabled &&
    input.onlineViewerEnabled &&
    input.publishedRevisionPresent;

  let connectivityLabel: ResolvedHostedDisplayStatus["connectivityLabel"] = "Checking…";
  let connectivityTone: ResolvedHostedDisplayStatus["connectivityTone"] = "muted";

  if (portalConnected) {
    connectivityLabel = "Connected";
    connectivityTone = "success";
  } else if (
    input.publisherOnline !== null ||
    !input.onlineViewerEnabled ||
    !input.publishedRevisionPresent
  ) {
    connectivityLabel = "Disconnected";
    connectivityTone = "danger";
  }

  const canOpenViewer = publishedAndEligible && (portalConnected || viewerRenderable);
  const canCopyUrl = canOpenViewer;
  const shouldPollBundle = input.displayEnabled && input.onlineViewerEnabled && input.publishedRevisionPresent;

  return {
    connectionStatus,
    connectivityLabel,
    connectivityTone,
    portalConnected,
    helperText,
    failureStage,
    canOpenViewer,
    canCopyUrl,
    shouldPollBundle,
  };
}

export function resolveViewerLoadErrorMessageForDisplay(input: {
  code: string | undefined;
  display?: HostedDisplayStatusInput | null;
}): string {
  const display = input.display;
  if (display) {
    const status = resolveHostedDisplayConnectionStatus({
      ...display,
      viewerRpcCode: input.code ?? null,
    });
    const helper = resolveHostedDisplayHelperText(display, status);
    if (helper) {
      return helper;
    }
  }

  switch (input.code) {
    case "authentication_required":
      return "Sign in to view this private display.";
    case "not_published":
      return "Waiting for first publication";
    case "not_found":
      return display?.authorized === false
        ? "You do not have access to this display."
        : display?.displayExists === false
          ? "Display could not be found."
          : !display?.displayEnabled
            ? "Enable the display in the desktop app before using it online."
            : !display?.onlineViewerEnabled
              ? "Turn on Online Viewer in the desktop app to use it online."
              : "This display is not available online yet.";
    default:
      return "Unable to load the online viewer.";
  }
}
