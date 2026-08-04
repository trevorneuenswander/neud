import { createHash } from "crypto";
import {
  ACTIVITY_SYSTEM_ACTOR_LABEL,
  isAutomatedActivityEventType,
  resolveActivityActorLabel,
} from "../../lib/activity/actor-resolution";
import type { ActivityEvent } from "../activity-session-store";

export type CloudActivityRow = {
  id: string;
  project_id: string | null;
  team_id: string | null;
  user_id: string | null;
  actor_display_name: string | null;
  event_type: string;
  description: string;
  metadata: Record<string, unknown>;
  source: string | null;
  severity: string;
  source_instance_id: string;
  source_local_id: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export function deterministicActivityCloudId(
  instanceId: string,
  localId: string,
): string {
  const hash = createHash("sha256")
    .update(`neud:activity:${instanceId}:${localId}`)
    .digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") +
      hash.slice(18, 20),
    hash.slice(20, 32),
  ].join("-");
}

export function resolveCloudIdForLocalEvent(input: {
  event: ActivityEvent;
  cloudId?: string | null;
  instanceId: string;
}): string {
  if (input.cloudId?.trim()) {
    return input.cloudId.trim();
  }
  if (/^[0-9a-f-]{36}$/i.test(input.event.id)) {
    return input.event.id;
  }
  return deterministicActivityCloudId(input.instanceId, input.event.id);
}

export function toCloudActivityRow(input: {
  event: ActivityEvent;
  cloudId: string;
  instanceId: string;
  teamId?: string | null;
}): CloudActivityRow {
  const metadata = { ...(input.event.metadata ?? {}) };
  const projectId =
    typeof metadata.projectId === "string" && metadata.projectId.trim()
      ? metadata.projectId.trim()
      : null;
  const teamId =
    input.teamId ??
    (typeof metadata.teamId === "string" && metadata.teamId.trim()
      ? metadata.teamId.trim()
      : null);
  const automated = isAutomatedActivityEventType(input.event.type);
  const actorName = input.event.actor?.name?.trim() ?? "";
  const actorId = input.event.actor?.id?.trim() ?? "";
  let actorDisplayName: string | null = actorName || null;
  if (actorName === ACTIVITY_SYSTEM_ACTOR_LABEL) {
    actorDisplayName = automated ? ACTIVITY_SYSTEM_ACTOR_LABEL : actorId ? null : ACTIVITY_SYSTEM_ACTOR_LABEL;
  }

  return {
    id: input.cloudId,
    project_id: projectId,
    team_id: teamId,
    user_id: automated ? null : actorId || null,
    actor_display_name: actorDisplayName,
    event_type: input.event.type,
    description: input.event.message,
    metadata,
    source: input.event.source ?? null,
    severity: input.event.severity ?? "info",
    source_instance_id: input.instanceId,
    source_local_id: input.event.id,
    occurred_at: input.event.timestamp,
    created_at: input.event.timestamp,
    updated_at: input.event.timestamp,
    deleted_at: null,
  };
}

export function fromCloudActivityRow(row: CloudActivityRow): ActivityEvent {
  const metadata = {
    ...(row.metadata ?? {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.team_id ? { teamId: row.team_id } : {}),
    description: row.description,
  };

  return {
    id: row.source_local_id ?? row.id,
    type: row.event_type,
    message: row.description,
    timestamp: row.occurred_at,
    source: row.source ?? undefined,
    severity:
      row.severity === "warning" || row.severity === "error"
        ? row.severity
        : "info",
    actor: {
      id: row.user_id ?? undefined,
      name: resolveActivityActorLabel({
        actorDisplayName: row.actor_display_name,
        actorId: row.user_id,
        eventType: row.event_type,
      }),
    },
    metadata,
  };
}
