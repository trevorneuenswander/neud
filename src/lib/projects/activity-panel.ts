import type { ActivityEvent } from "@/lib/desktop/types";
import {
  ACTIVITY_SYSTEM_ACTOR_LABEL,
  resolveActivityDisplayActorLabel,
} from "@/lib/activity/actor-resolution";
import { selectNewestActivityEvents } from "@/lib/activity/sort";

export { ACTIVITY_SYSTEM_ACTOR_LABEL, resolveActivityDisplayActorLabel };

export const ACTIVITY_ROW_MIN_HEIGHT_PX = 68;
export const ACTIVITY_PANEL_VISIBLE_ROWS = 5;
export const ACTIVITY_ROW_GAP_PX = 8;

export const ACTIVITY_PANEL_SCROLL_HEIGHT_PX =
  ACTIVITY_ROW_MIN_HEIGHT_PX * ACTIVITY_PANEL_VISIBLE_ROWS +
  ACTIVITY_ROW_GAP_PX * (ACTIVITY_PANEL_VISIBLE_ROWS - 1);

export const ACTIVITY_OVERVIEW_LIMIT = 50;
export const ACTIVITY_FULL_PAGE_SIZE = 100;
export const ACTIVITY_SCROLL_NEAR_BOTTOM_THRESHOLD_PX = 48;

export type ActivityOrder = "oldest-first" | "newest-first";

export const ACTIVITY_ORDER_OPTIONS: { value: ActivityOrder; label: string }[] = [
  { value: "oldest-first", label: "Oldest First" },
  { value: "newest-first", label: "Newest First" },
];

export function getActivityActorFilterLabel(entry: ActivityEvent): string {
  return resolveActivityDisplayActorLabel({
    actorName: entry.actor?.name,
    actorId: entry.actor?.id,
    type: entry.type,
  });
}

export function getUniqueActivityActorLabels(entries: ActivityEvent[]): string[] {
  const labels = new Set<string>();
  for (const entry of entries) {
    labels.add(getActivityActorFilterLabel(entry));
  }
  return [...labels].sort((left, right) => {
    if (left === ACTIVITY_SYSTEM_ACTOR_LABEL) return 1;
    if (right === ACTIVITY_SYSTEM_ACTOR_LABEL) return -1;
    return left.localeCompare(right);
  });
}

export function filterActivityForProjectSlug(
  entries: ActivityEvent[],
  projectSlug: string,
): ActivityEvent[] {
  return entries.filter((entry) => {
    const metadata = entry.metadata ?? {};
    if (metadata.projectSlug === projectSlug) {
      return true;
    }
    return false;
  });
}

export function getUniqueActivityProjectLabels(
  entries: ActivityEvent[],
): Array<{ slug: string; name: string }> {
  const projects = new Map<string, string>();
  for (const entry of entries) {
    const metadata = entry.metadata ?? {};
    const slug =
      typeof metadata.projectSlug === "string" ? metadata.projectSlug : null;
    const name =
      typeof metadata.projectName === "string" ? metadata.projectName : slug;
    if (slug && name) {
      projects.set(slug, name);
    }
  }
  return [...projects.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Select the latest overview entries in newest-first display order. */
export function getOverviewDisplayEntries(entries: ActivityEvent[]): ActivityEvent[] {
  return selectNewestActivityEvents(entries, ACTIVITY_OVERVIEW_LIMIT);
}

export function filterActivityEntries(
  entries: ActivityEvent[],
  actorFilter: string,
): ActivityEvent[] {
  if (actorFilter === "all") {
    return entries;
  }
  return entries.filter(
    (entry) => getActivityActorFilterLabel(entry) === actorFilter,
  );
}

export function orderActivityEntries(
  entries: ActivityEvent[],
  order: ActivityOrder,
): ActivityEvent[] {
  if (order === "newest-first") {
    return entries;
  }
  return [...entries].reverse();
}

export const ACTIVITY_SCROLL_NEAR_TOP_THRESHOLD_PX = 48;

export function isNearActivityTop(
  element: HTMLElement,
  threshold = ACTIVITY_SCROLL_NEAR_TOP_THRESHOLD_PX,
): boolean {
  return element.scrollTop < threshold;
}

export function isNearActivityBottom(
  element: HTMLElement,
  threshold = ACTIVITY_SCROLL_NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight < threshold
  );
}

export function scrollActivityToBottom(element: HTMLElement) {
  element.scrollTop = element.scrollHeight;
}

export function scrollActivityToTop(element: HTMLElement) {
  element.scrollTop = 0;
}
