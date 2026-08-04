import type { ActivityEvent } from "./activity-session-store";
import { resolveActivityActorName } from "./activity-message";
import { getCleanActivityDescription } from "../lib/activity/description";

import { selectNewestActivityEvents } from "../lib/activity/sort";

const ACTIVITY_OVERVIEW_LIMIT = 50;

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
};

export type ActivityDisplayEvent = {
  id: string;
  projectId: string;
  projectSlug?: string;
  projectName?: string;
  actorId?: string;
  actorName: string;
  message: string;
  createdAt: string;
  type?: string;
  severity?: ActivityEvent["severity"];
};

function humanizeActivityType(type: string): string {
  const mapped = ACTIVITY_TYPE_LABELS[type];
  if (mapped) return mapped;
  return type
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeActivityEventForDisplay(
  event: ActivityEvent,
  project?: { id: string; slug: string; name: string } | null,
  soleProject?: { id: string; slug: string; name: string } | null,
): ActivityDisplayEvent | null {
  const metadata = event.metadata ?? {};
  let projectId =
    typeof metadata.projectId === "string" ? metadata.projectId : null;
  let resolvedProject = project ?? null;

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

  const messageRaw = event.message?.trim() ?? "";
  const actorName = resolveActivityActorName(event.actor, event.type);
  const actorId =
    (typeof event.actor?.id === "string" ? event.actor.id : null) ??
    (typeof metadata.userId === "string" ? metadata.userId : null) ??
    (typeof metadata.actorId === "string" ? metadata.actorId : null) ??
    undefined;
  const message =
    getCleanActivityDescription(
      messageRaw || humanizeActivityType(event.type),
      actorName,
    ) || humanizeActivityType(event.type);
  if (!messageRaw) {
    console.warn(
      `[activity] Missing message for event ${event.id}; using type fallback`,
    );
  }

  return {
    id: event.id,
    projectId,
    projectSlug:
      (typeof metadata.projectSlug === "string" ? metadata.projectSlug : null) ??
      resolvedProject?.slug ??
      undefined,
    projectName:
      (typeof metadata.projectName === "string" ? metadata.projectName : null) ??
      resolvedProject?.name ??
      undefined,
    actorId,
    actorName,
    message,
    createdAt: event.timestamp,
    type: event.type,
    severity: event.severity,
  };
}

export function selectCompactActivityEvents(
  events: ActivityDisplayEvent[],
  maxItems = ACTIVITY_OVERVIEW_LIMIT,
): ActivityDisplayEvent[] {
  return selectNewestActivityEvents(events, maxItems);
}

export { ACTIVITY_OVERVIEW_LIMIT };
