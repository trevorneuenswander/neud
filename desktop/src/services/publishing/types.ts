import type { NeudPublishedProjectPayload } from "../../publishing/contract";

export type ProjectPublishingStatus =
  | "disabled"
  | "waiting_for_data"
  | "acquiring_lease"
  | "active"
  | "publishing"
  | "reconnecting"
  | "paused_offline"
  | "publisher_conflict"
  | "authentication_required"
  | "cloud_session_required"
  | "error";

export type ProjectPublishingDiagnostics = {
  projectId: string;
  publishingEnabled: boolean;
  status: ProjectPublishingStatus;
  instanceId: string;
  leaseOwnerInstanceId: string | null;
  ownsLease: boolean;
  leaseExpiresAt: string | null;
  lastLeaseHeartbeatAt: string | null;
  latestLocalRevision: number | null;
  latestLocalHash: string | null;
  latestPublishedRevision: number | null;
  latestPublishedHash: string | null;
  lastSuccessfulPublishAt: string | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  lastErrorSummary: string | null;
  queuedUpdatePresent: boolean;
  payloadSizeBytes: number | null;
  sourceMode: NeudPublishedProjectPayload["source"]["mode"] | null;
  sourceConnected: boolean | null;
};

export type PublishingDiagnostics = {
  instanceId: string;
  started: boolean;
  online: boolean;
  authenticated: boolean;
  cloudSessionAvailable: boolean;
  projects: ProjectPublishingDiagnostics[];
};

export const PUBLISHING_BACKOFF_MS = [5_000, 15_000, 45_000, 120_000] as const;
export const PUBLISHING_HEARTBEAT_MS = 20_000;
export const PUBLISHING_LEASE_DURATION_SECONDS = 90;
/** Viewer treats publisher heartbeat older than this as offline (2 missed heartbeats + buffer). */
export const PUBLISHING_HEARTBEAT_STALE_SECONDS = 45;
export const PUBLISHING_DISABLE_GRACE_MS = 30_000;
export const PUBLISHING_DEBOUNCE_MS = 750;
export const PUBLISHING_MAX_PAYLOAD_BYTES = 1_048_576;
export const PUBLISHING_SETTINGS_POLL_MS = 60_000;

export const publishingProjectEnabledCacheKey = (projectId: string) =>
  `publishing.project.${projectId}.enabledCache`;

export const publishingProjectLastPublishedHashKey = (projectId: string) =>
  `publishing.project.${projectId}.lastPublishedHash`;

export const publishingProjectLastPublishedRevisionKey = (projectId: string) =>
  `publishing.project.${projectId}.lastPublishedRevision`;

export const publishingProjectLastSuccessfulPublishAtKey = (projectId: string) =>
  `publishing.project.${projectId}.lastSuccessfulPublishAt`;

export const publishingProjectCanonicalPublishDiagnosticsKey = (projectId: string) =>
  `publishing.project.${projectId}.canonicalPublishDiagnostics`;

export type PendingPublishPayload = {
  payload: NeudPublishedProjectPayload;
  payloadHash: string;
  payloadSizeBytes: number;
  queuedAt: string;
};

export type RpcResultCode =
  | "lease_acquired"
  | "lease_renewed"
  | "lease_released"
  | "lease_not_present"
  | "lease_conflict"
  | "lease_not_owned"
  | "publishing_disabled"
  | "published"
  | "duplicate_unchanged"
  | "stale_revision"
  | "payload_too_large"
  | "authentication_required"
  | "forbidden"
  | "invalid_input";

export function computePublishingBackoffMs(
  attempt: number,
  schedule: readonly number[] = PUBLISHING_BACKOFF_MS,
): number {
  const index = Math.min(Math.max(attempt, 0), schedule.length - 1);
  const base = schedule[index] ?? schedule[schedule.length - 1] ?? 5_000;
  const jitter = Math.floor(base * 0.2 * Math.random());
  return base + jitter;
}

export function isRecoverablePublishingError(code: string | null | undefined): boolean {
  if (!code) {
    return true;
  }
  return ![
    "publishing_disabled",
    "stale_revision",
    "payload_too_large",
    "lease_not_owned",
    "authentication_required",
    "forbidden",
    "invalid_input",
  ].includes(code);
}
