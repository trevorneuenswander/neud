import type { ActivityEvent } from "@/lib/desktop/types";
import { filterDeprecatedActivityEntries } from "@/lib/projects/deprecated-activity-types";
import { filterNoisyActivityEntries } from "@/lib/activity/noisy-activity-types";

export type ActivityProjectScope = {
  projectId: string;
  projectSlug?: string;
  projectEngineIds?: string[];
};

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveActivityEventProjectId(
  event: ActivityEvent,
  scope?: ActivityProjectScope,
): string | null {
  const metadata = event.metadata ?? {};
  const metadataProjectId = readMetadataString(metadata, "projectId");
  if (metadataProjectId) {
    return metadataProjectId;
  }

  const metadataEngineId = readMetadataString(metadata, "engineId");
  if (
    metadataEngineId &&
    scope?.projectEngineIds?.includes(metadataEngineId)
  ) {
    return scope.projectId;
  }

  if (
    scope?.projectEngineIds?.length === 1 &&
    metadataEngineId === scope.projectEngineIds[0]
  ) {
    return scope.projectId;
  }

  const metadataSlug = readMetadataString(metadata, "projectSlug");
  if (scope?.projectSlug && metadataSlug === scope.projectSlug) {
    return scope.projectId;
  }

  return null;
}

export function activityEventBelongsToProject(
  event: ActivityEvent,
  scope: ActivityProjectScope,
): boolean {
  const resolvedProjectId = resolveActivityEventProjectId(event, scope);
  if (resolvedProjectId) {
    return resolvedProjectId === scope.projectId;
  }

  return false;
}

export function filterActivityEventsForProject(
  entries: ActivityEvent[],
  scope: ActivityProjectScope,
): ActivityEvent[] {
  return filterPresentableActivityEntries(entries).filter((entry) =>
    activityEventBelongsToProject(entry, scope),
  );
}

export function filterPresentableActivityEntries(entries: ActivityEvent[]): ActivityEvent[] {
  return filterNoisyActivityEntries(filterDeprecatedActivityEntries(entries));
}

export function getActivityScopeKey(scope: "global" | "project", projectId?: string): string {
  if (scope === "project" && projectId) {
    return `activity:project:${projectId}`;
  }
  return "activity:global";
}
