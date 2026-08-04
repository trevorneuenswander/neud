import {
  resolveActivityActorLabel,
  resolveActivityDisplayActorLabel,
} from "@/lib/activity/actor-resolution";
import type { ActivityEvent } from "@/lib/desktop/types";
import type { DashboardActivityItem } from "@/lib/dashboard/types";
import { ACTIVITY_OVERVIEW_LIMIT } from "@/lib/projects/activity-panel";
import { selectNewestActivityEvents, sortActivityEventsNewestFirst } from "@/lib/activity/sort";
import {
  activityEventBelongsToProject,
  filterPresentableActivityEntries,
  type ActivityProjectScope,
} from "@/lib/activity/filter";
import type { ActivityDisplayEvent, ActivityProjectSummary, FullActivityDisplayEvent } from "@/lib/activity/types";
import { getCleanActivityDescription } from "@/lib/activity/description";

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  "developer-tools.scraper-published": "Scraper code published",
  "developer-tools.scraper-revision-restored": "Scraper revision restored",
  "developer-tools.display-published": "Display code published",
  "developer-tools.display-revision-restored": "Display revision restored",
  "developer-tools.display-version-deleted": "Display version deleted",
  "developer-tools.display-created": "HTML display created",
  "developer-tools.display-renamed": "Display renamed",
  "developer-tools.display-archived": "Display archived",
  "developer-tools.display-deleted": "Display deleted",
  "project.settings-updated": "Project settings updated",
  "project.marked-inactive": "Project marked inactive",
  "project.marked-active": "Project marked active",
  "display.url-copied": "Display local URL copied",
  "data-source.changed": "Data source changed",
};

export function humanizeActivityType(type: string): string {
  const trimmed = type.trim();
  if (!trimmed) {
    return "Activity recorded";
  }

  const mapped = ACTIVITY_TYPE_LABELS[trimmed];
  if (mapped) {
    return mapped;
  }

  return trimmed
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeActivityEvent(
  event: ActivityEvent | DashboardActivityItem,
  project?: ActivityProjectSummary | null,
  soleProject?: ActivityProjectSummary | null,
): ActivityDisplayEvent | null {
  const metadata =
    "metadata" in event && event.metadata && typeof event.metadata === "object"
      ? (event.metadata as Record<string, unknown>)
      : undefined;

  let projectId =
    ("projectId" in event && typeof event.projectId === "string"
      ? event.projectId
      : null) ?? readMetadataString(metadata, "projectId");

  const metadataSlug = readMetadataString(metadata, "projectSlug");
  const metadataName = readMetadataString(metadata, "projectName");

  let resolvedProject = project ?? null;
  if (!resolvedProject && projectId) {
    resolvedProject = null;
  }
  if (!resolvedProject && !projectId && soleProject) {
    resolvedProject = soleProject;
    projectId = soleProject.id;
  }

  if (!projectId && resolvedProject) {
    projectId = resolvedProject.id;
  }

  if (!projectId) {
    return null;
  }

  const createdAt =
    ("createdAt" in event && typeof event.createdAt === "string"
      ? event.createdAt
      : null) ??
    ("timestamp" in event && typeof event.timestamp === "string"
      ? event.timestamp
      : null) ??
    new Date().toISOString();

  const actorFromEvent =
    "actorName" in event && typeof event.actorName === "string"
      ? event.actorName.trim()
      : "";
  const actorFromNested =
    "actor" in event && event.actor && typeof event.actor.name === "string"
      ? event.actor.name.trim()
      : "";

  const actorId =
    ("actorId" in event && typeof event.actorId === "string" ? event.actorId : null) ??
    ("actor" in event && event.actor && typeof event.actor.id === "string"
      ? event.actor.id
      : null) ??
    readMetadataString(metadata, "userId") ??
    readMetadataString(metadata, "actorId") ??
    undefined;

  const actorName = resolveActivityActorLabel({
    actorName: actorFromEvent || actorFromNested,
    actorId,
    eventType: "type" in event && typeof event.type === "string" ? event.type : null,
  });

  const rawMessage =
    ("message" in event && typeof event.message === "string" ? event.message : "") ||
    readMetadataString(metadata, "description") ||
    readMetadataString(metadata, "action") ||
    "";

  const type =
    "type" in event && typeof event.type === "string" ? event.type : undefined;

  const message = getCleanActivityDescription(
    rawMessage.trim() || humanizeActivityType(type ?? ""),
    actorName,
  );

  if (!message.trim()) {
    console.warn(`[activity] Missing message for event ${event.id}; using type fallback`);
  }

  const projectSlug =
    ("projectSlug" in event && typeof event.projectSlug === "string"
      ? event.projectSlug
      : null) ??
    metadataSlug ??
    resolvedProject?.slug ??
    undefined;

  const projectName =
    ("projectName" in event && typeof event.projectName === "string"
      ? event.projectName
      : null) ??
    metadataName ??
    resolvedProject?.name ??
    undefined;

  const projectDescription =
    resolvedProject?.description !== undefined
      ? resolvedProject.description
      : null;

  const projectAvailable = Boolean(resolvedProject);

  return {
    id: event.id,
    projectId,
    projectSlug,
    projectName,
    projectDescription,
    projectAvailable,
    actorId,
    actorName,
    message,
    displayDescription: message,
    createdAt,
    type,
    severity:
      "severity" in event && event.severity ? event.severity : undefined,
  };
}

/** Select newest N events, return newest-first for compact preview display. */
export function selectCompactActivityEvents(
  events: ActivityDisplayEvent[],
  maxItems = ACTIVITY_OVERVIEW_LIMIT,
): ActivityDisplayEvent[] {
  return selectNewestActivityEvents(events, maxItems);
}

function eventMatchesProjectFilter(input: {
  event: ActivityEvent;
  projectId?: string;
  projectSlug?: string;
  projectEngineIds?: string[];
}): boolean {
  if (!input.projectId && !input.projectSlug) {
    return true;
  }

  if (!input.projectId) {
    const metadata = input.event.metadata ?? {};
    const metadataSlug =
      typeof metadata.projectSlug === "string" ? metadata.projectSlug : null;
    return Boolean(input.projectSlug && metadataSlug === input.projectSlug);
  }

  return activityEventBelongsToProject(input.event, {
    projectId: input.projectId,
    projectSlug: input.projectSlug,
    projectEngineIds: input.projectEngineIds,
  });
}

export function normalizeActivityEventsForProjects(input: {
  events: ActivityEvent[];
  projects: ActivityProjectSummary[];
  projectSlug?: string;
  projectId?: string;
  projectEngineIds?: string[];
  /** Pass `null` to keep the full history (newest-first). */
  maxItems?: number | null;
}): ActivityDisplayEvent[] {
  const projectById = new Map(input.projects.map((project) => [project.id, project]));
  const projectBySlug = new Map(input.projects.map((project) => [project.slug, project]));
  const soleProject = input.projects.length === 1 ? input.projects[0]! : null;
  const presentableEvents = filterPresentableActivityEntries(input.events);

  const normalized: ActivityDisplayEvent[] = [];

  for (const event of presentableEvents) {
    if (
      !eventMatchesProjectFilter({
        event,
        projectId: input.projectId,
        projectSlug: input.projectSlug,
        projectEngineIds: input.projectEngineIds,
      })
    ) {
      continue;
    }

    const metadata = event.metadata ?? {};
    const metadataProjectId =
      typeof metadata.projectId === "string" ? metadata.projectId : null;
    const metadataProjectSlug =
      typeof metadata.projectSlug === "string" ? metadata.projectSlug : null;

    const project =
      (metadataProjectId ? projectById.get(metadataProjectId) : null) ??
      (metadataProjectSlug ? projectBySlug.get(metadataProjectSlug) : null) ??
      (input.projectId ? projectById.get(input.projectId) : null) ??
      (input.projectSlug ? projectBySlug.get(input.projectSlug) : null) ??
      null;

    const scopedEvent =
      input.projectId && !metadataProjectId
        ? enrichEventWithProjectScope(
            event,
            {
              projectId: input.projectId,
              projectSlug: input.projectSlug,
              projectEngineIds: input.projectEngineIds,
            },
            project,
          )
        : event;

    const displayEvent = normalizeActivityEvent(scopedEvent, project, soleProject);
    if (displayEvent) {
      normalized.push({
        ...displayEvent,
        projectAvailable: Boolean(project),
      });
    } else if (process.env.NODE_ENV !== "production") {
      console.warn(`[activity] Skipped malformed event ${event.id}`);
    }
  }

  if (input.maxItems === null) {
    return sortActivityEventsNewestFirst(normalized);
  }

  return selectCompactActivityEvents(normalized, input.maxItems ?? ACTIVITY_OVERVIEW_LIMIT);
}

function enrichEventWithProjectScope(
  event: ActivityEvent,
  scope: ActivityProjectScope,
  project?: ActivityProjectSummary | null,
): ActivityEvent {
  const metadata = event.metadata ?? {};
  if (readMetadataString(metadata, "projectId")) {
    return event;
  }

  if (!activityEventBelongsToProject(event, scope)) {
    return event;
  }

  return {
    ...event,
    metadata: {
      ...metadata,
      projectId: scope.projectId,
      ...(scope.projectSlug ? { projectSlug: scope.projectSlug } : {}),
      ...(project?.name ? { projectName: project.name } : {}),
    },
  };
}

export function toFullActivityDisplayEvent(
  event: ActivityDisplayEvent,
  project?: ActivityProjectSummary | null,
): FullActivityDisplayEvent {
  return {
    ...event,
    projectSlug: event.projectSlug ?? project?.slug ?? "unknown",
    projectName: event.projectName ?? project?.name ?? "Project unavailable",
    projectDescription:
      event.projectDescription ?? project?.description ?? null,
    actorName: resolveActivityDisplayActorLabel({
      actorName: event.actorName,
      actorId: event.actorId,
      type: event.type,
    }),
    message: event.message || "Activity recorded",
  };
}

export function buildActivityProjectSummaryMap(
  projects: ActivityProjectSummary[],
): Map<string, ActivityProjectSummary> {
  return new Map(projects.map((project) => [project.id, project]));
}
