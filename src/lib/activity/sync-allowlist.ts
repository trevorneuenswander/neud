/** Exact event types accepted by cloud `upsert_activity_events_for_sync`. */
export const ACTIVITY_SYNC_ALLOWED_EVENT_TYPES = [
  "access.team-created",
  "access.team-updated",
  "access.team-deactivated",
  "access.team-reactivated",
  "access.user-invited",
  "access.user-updated",
  "access.project-assigned",
  "access.project-unassigned",
  "access.project-team-assigned",
  "access.project-team-removed",
  "access.team-member-updated",
  "access.team-member-removed",
  "project.created",
  "project.updated",
  "project.deleted",
  "project.marked-active",
  "project.marked-inactive",
  "project.settings-updated",
  "display.created",
  "display.updated",
  "display.deleted",
  "display.published",
  "display.order_changed",
  "display.enabled",
  "display.disabled",
  "display.connection",
  "display.refresh-rate-changed",
  "display.size-changed",
  "display.online_viewer_enabled",
  "display.online_viewer_disabled",
  "display.online_visibility_changed",
  "display.online_published",
  "display.online_publish_failed",
  "display.online_publish_resumed",
  "display.activated_online",
  "display.deactivated_online",
  "developer-tools.scraper-published",
  "developer-tools.scraper-revision-restored",
  "developer-tools.display-published",
  "developer-tools.display-revision-restored",
  "developer-tools.display-version-deleted",
  "developer-tools.display-created",
  "developer-tools.display-renamed",
  "developer-tools.display-details-updated",
  "developer-tools.display-archived",
  "developer-tools.display-unarchived",
  "developer-tools.display-deleted",
  "developer-tools.display-version-activated",
  "developer-tools.display-version-renamed",
  "team.created",
  "team.deleted",
  "team.updated",
  "team.archived",
  "team.member_added",
  "team.member_removed",
  "team.member_role_changed",
  "project.member_added",
  "project.member_removed",
  "project.member_role_changed",
  "project.team_assigned",
  "project.team_removed",
  "invitation.created",
  "invitation.resent",
  "invitation.revoked",
  "invitation.accepted",
  "invitation.expired",
  "engine.started",
  "engine.stopped",
  "engine.error",
  "data-source.updated",
  "data-source.changed",
  "scraper.failed",
  "scraper.interval-changed",
  "scraper.started",
  "scraper.stopped",
  "scraper.restarted",
  "scraper_polling_interval_changed",
  "controller.downloads.cleared",
  "controller.lot.photos-added",
  "controller.lot-status",
  "bag.live-state.updated",
  "comprehensive-export-started",
  "comprehensive-export-progress",
  "comprehensive-export-complete",
  "comprehensive-export-cancelled",
  "manual.override",
  "system.info",
  "system.warning",
  "system.error",
  "user.action",
  "user.deleted",
  "app.exit-canceled",
  "app.exit-confirmed",
] as const;

export type ActivitySyncAllowedEventType = (typeof ACTIVITY_SYNC_ALLOWED_EVENT_TYPES)[number];

const ALLOWED_SET = new Set<string>(ACTIVITY_SYNC_ALLOWED_EVENT_TYPES);

export function isActivitySyncAllowedEventType(type: string): boolean {
  return ALLOWED_SET.has(type.trim());
}

export function isRecoverableAllowlistSyncError(error: string | null | undefined): boolean {
  if (!error?.trim()) {
    return false;
  }
  const normalized = error.toLowerCase();
  return (
    normalized.includes("not allowed") ||
    normalized.includes("forbidden") ||
    normalized.includes("event_type=")
  );
}
