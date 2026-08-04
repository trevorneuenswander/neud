import { createClient } from "@/lib/supabase/server";
import {
  ACTIVITY_SYSTEM_ACTOR_LABEL,
  isAutomatedActivityEventType,
  resolveActivityActorLabel,
  resolveProfileActorLabel,
} from "@/lib/activity/actor-resolution";
import { sortActivityEventsNewestFirst } from "@/lib/activity/sort";
import { getHostedAccessibleProjects } from "@/lib/hosted/portal-queries";

export type HostedActivityEvent = {
  id: string;
  projectId: string | null;
  projectSlug: string | null;
  projectName: string | null;
  actorId: string | null;
  actorName: string;
  eventType: string;
  description: string;
  occurredAt: string;
};

const HOSTED_ACTIVITY_LIMIT = 100;

function formatEventTypeLabel(eventType: string): string {
  const labels: Record<string, string> = {
    "online_viewer.enabled": "Online Viewer enabled",
    "online_viewer.disabled": "Online Viewer disabled",
    "display.published": "Display published",
    "display.updated": "Display updated",
    "display.enabled": "Display enabled",
    "display.disabled": "Display disabled",
    "display.online_viewer_enabled": "Online Viewer enabled",
    "display.online_viewer_disabled": "Online Viewer disabled",
    "display.activated_online": "Display activated online",
    "display.deactivated_online": "Display deactivated online",
    "project.settings_changed": "Project settings changed",
    "user.access_changed": "User access changed",
    "scraper.started": "Scraper started",
    "scraper.stopped": "Scraper stopped",
    "controller.data_updated": "Controller data updated",
  };

  if (labels[eventType]) {
    return labels[eventType];
  }

  return eventType
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function getHostedActivityEvents(limit = HOSTED_ACTIVITY_LIMIT) {
  const projects = await getHostedAccessibleProjects();
  const projectIds = projects.map((project) => project.id);
  if (projectIds.length === 0) {
    return [];
  }

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("activity_events")
    .select("id, project_id, user_id, actor_display_name, event_type, description, occurred_at")
    .is("deleted_at", null)
    .in("project_id", projectIds)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  const missingProfileUserIds = [
    ...new Set(
      data
        .filter((row) => {
          if (typeof row.user_id !== "string") {
            return false;
          }
          const eventType =
            typeof row.event_type === "string" ? row.event_type : "";
          if (isAutomatedActivityEventType(eventType)) {
            return false;
          }
          const actorDisplayName =
            typeof row.actor_display_name === "string"
              ? row.actor_display_name.trim()
              : "";
          if (!actorDisplayName) {
            return true;
          }
          return actorDisplayName === ACTIVITY_SYSTEM_ACTOR_LABEL;
        })
        .map((row) => String(row.user_id)),
    ),
  ];

  const profileNameByUserId = new Map<string, string>();
  if (missingProfileUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", missingProfileUserIds);

    for (const profile of profiles ?? []) {
      if (typeof profile.id !== "string") {
        continue;
      }
      const label = resolveProfileActorLabel({
        full_name: typeof profile.full_name === "string" ? profile.full_name : null,
        email: typeof profile.email === "string" ? profile.email : null,
      });
      if (label) {
        profileNameByUserId.set(profile.id, label);
      }
    }
  }

  const events = data.flatMap((row) => {
    const projectId = typeof row.project_id === "string" ? row.project_id : null;
    const project = projectId ? projectById.get(projectId) : null;
    const eventType = typeof row.event_type === "string" ? row.event_type : "event";
    const description =
      typeof row.description === "string" && row.description.trim()
        ? row.description.trim()
        : formatEventTypeLabel(eventType);
    const userId = typeof row.user_id === "string" ? row.user_id : null;
    const actorDisplayName =
      typeof row.actor_display_name === "string" ? row.actor_display_name : null;
    const profileName = userId ? profileNameByUserId.get(userId) ?? null : null;

    return [
      {
        id: String(row.id),
        projectId,
        projectSlug: project?.slug ?? null,
        projectName: project?.name ?? null,
        actorId: userId,
        actorName: resolveActivityActorLabel({
          actorDisplayName,
          profileName,
          actorId: userId,
          eventType,
        }),
        eventType,
        description,
        occurredAt:
          typeof row.occurred_at === "string" ? row.occurred_at : new Date().toISOString(),
      } satisfies HostedActivityEvent,
    ];
  });

  return sortActivityEventsNewestFirst(events);
}
