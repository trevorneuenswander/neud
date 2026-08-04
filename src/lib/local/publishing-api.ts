import { localFetch } from "@/lib/local/api";

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
  latestPublishedRevision: number | null;
  lastSuccessfulPublishAt: string | null;
  lastErrorSummary: string | null;
  sourceMode: string | null;
  sourceConnected: boolean | null;
};

export function resolveLiveDataStatusLabel(
  diagnostics: ProjectPublishingDiagnostics | null | undefined,
): string {
  if (!diagnostics?.publishingEnabled) {
    return "Not publishing";
  }

  switch (diagnostics.status) {
    case "active":
      return "Live";
    case "waiting_for_data":
      return "Waiting for Data";
    case "publishing":
    case "acquiring_lease":
    case "reconnecting":
      return "Publishing";
    case "authentication_required":
    case "cloud_session_required":
    case "paused_offline":
      return "Cloud Session Required";
    case "publisher_conflict":
    case "error":
      return "Failed";
    default:
      return "Not publishing";
  }
}

export async function localGetProjectPublishingStatus(
  projectSlug: string,
): Promise<ProjectPublishingDiagnostics | null> {
  const response = await localFetch<{
    ok: boolean;
    diagnostics: ProjectPublishingDiagnostics | null;
  }>(`/api/projects/${encodeURIComponent(projectSlug)}/publishing/status`);
  return response.diagnostics ?? null;
}
