export const PUBLISHER_STALE_SECONDS = 45;

export const ACTIVE_BROAD_ARROW_DISPLAY_SLUGS = [
  "legacy-pylon",
  "legacy-ticker",
  "stream-bid-display",
  "stream-ticker",
];

export function ageSeconds(iso) {
  if (!iso) {
    return null;
  }
  const ms = Date.now() - Date.parse(String(iso));
  if (!Number.isFinite(ms)) {
    return null;
  }
  return Math.max(0, Math.round(ms / 1000));
}

export function summarizeLeaseRow(lease, nowMs = Date.now()) {
  const leaseExpired =
    !lease?.lease_expires_at || Date.parse(String(lease.lease_expires_at)) <= nowMs;
  const publisherLeaseExists = Boolean(lease && !lease.released_at);
  const lastHeartbeatAgeSeconds = ageSeconds(lease?.last_heartbeat_at);
  const heartbeatFresh =
    lastHeartbeatAgeSeconds != null
      ? lastHeartbeatAgeSeconds <= PUBLISHER_STALE_SECONDS
      : false;

  return {
    publisherLeaseExists,
    leaseExpired,
    leasePublisherInstanceId: lease?.publisher_instance_id ?? null,
    lastHeartbeatAt: lease?.last_heartbeat_at ?? null,
    lastHeartbeatAgeSeconds,
    heartbeatFresh,
    leaseExpiresAt: lease?.lease_expires_at ?? null,
  };
}

export function resolvePublisherConnectionFailureStage(input) {
  if (!input.authenticatedCloudSessionAvailable && !input.hasRestorableCloudSession) {
    return "no_cloud_session";
  }
  if (!input.publishingManagerRunning) {
    return "publishing_manager_not_running";
  }
  if (!input.heartbeatTimerActive) {
    return "heartbeat_timer_missing";
  }
  if ((input.eligibleOnlineViewerDisplays ?? 0) === 0) {
    return "no_eligible_online_displays";
  }
  if (input.projectPublishingEnabled === false) {
    return "project_publishing_disabled";
  }
  if (
    input.localDesktopInstanceId &&
    input.leasePublisherInstanceId &&
    input.localDesktopInstanceId !== input.leasePublisherInstanceId
  ) {
    return "instance_id_mismatch";
  }
  if (!input.publisherLeaseExists) {
    return "lease_missing";
  }
  if (input.leaseExpired) {
    return "lease_expired";
  }
  if (
    input.lastHeartbeatAgeSeconds != null &&
    input.lastHeartbeatAgeSeconds > PUBLISHER_STALE_SECONDS
  ) {
    return "viewer_bundle_stale";
  }
  if (input.viewerPublisherOnline === false && input.heartbeatFresh) {
    return "viewer_bundle_mapping_wrong";
  }
  return "none";
}

export function resolveComputedConnectionStatus(input) {
  if (!input.onlineViewerEnabled) {
    return "disconnected";
  }
  if (input.viewerPublisherOnline === true) {
    return "connected";
  }
  return "disconnected";
}

export function buildAlignedConnectionSection(input) {
  const firstPublisherConnectionFailureStage = resolvePublisherConnectionFailureStage(input);
  return {
    authenticatedCloudSessionAvailable: input.authenticatedCloudSessionAvailable ?? null,
    hasRestorableCloudSession: input.hasRestorableCloudSession ?? null,
    publishingManagerRunning: input.publishingManagerRunning ?? null,
    heartbeatTimerActive: input.heartbeatTimerActive ?? null,
    localDesktopInstanceId: input.localDesktopInstanceId ?? null,
    activePublisherInstanceId: input.activePublisherInstanceId ?? null,
    leasePublisherInstanceId: input.leasePublisherInstanceId ?? null,
    publisherLeaseExists: input.publisherLeaseExists ?? null,
    leaseExpired: input.leaseExpired ?? null,
    lastHeartbeatAgeSeconds: input.lastHeartbeatAgeSeconds ?? null,
    viewerStaleThresholdSeconds: PUBLISHER_STALE_SECONDS,
    projectPublishingEnabled: input.projectPublishingEnabled ?? null,
    eligibleOnlineViewerDisplays: input.eligibleOnlineViewerDisplays ?? null,
    onlineViewerEnabled: input.onlineViewerEnabled ?? null,
    viewerPublisherOnline: input.viewerPublisherOnline ?? null,
    computedConnectionStatus: resolveComputedConnectionStatus(input),
    firstPublisherConnectionFailureStage,
  };
}
