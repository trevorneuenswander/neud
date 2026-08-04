"use client";

import { useMemo } from "react";
import { ActivityProjectLink } from "@/components/activity/ActivityProjectLink";
import {
  ActivityUserLink,
  toLinkableUserIdSet,
} from "@/components/activity/ActivityUserLink";
import type { ActivityDisplayEvent } from "@/lib/activity/types";
import {
  ACTIVITY_ROW_MIN_HEIGHT_PX,
  resolveActivityDisplayActorLabel,
} from "@/lib/projects/activity-panel";
import {
  formatActivityTableDate,
  formatActivityTableDateTitle,
} from "@/lib/activity/format";

type ActivityTableProps = {
  events: ActivityDisplayEvent[];
  showProjectName?: boolean;
  linkableUserIds?: string[];
};

export function ActivityTable({
  events,
  showProjectName = true,
  linkableUserIds,
}: ActivityTableProps) {
  const linkableUsers = useMemo(
    () => toLinkableUserIdSet(linkableUserIds),
    [linkableUserIds],
  );

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-surface-raised">
          <tr>
            {showProjectName ? (
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted">
                Project Name
              </th>
            ) : null}
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted">
              User
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted">
              Description
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted">
              Date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {events.map((event) => {
            const userLabel = resolveActivityDisplayActorLabel({
              actorName: event.actorName,
              actorId: event.actorId,
              type: event.type,
            });
            const messageClassName =
              event.severity === "error"
                ? "text-danger"
                : event.severity === "warning"
                  ? "text-warning"
                  : "text-foreground";

            return (
              <tr key={event.id} style={{ minHeight: ACTIVITY_ROW_MIN_HEIGHT_PX }}>
                {showProjectName ? (
                  <td className="px-4 py-3 align-top">
                    <ActivityProjectLink
                      projectSlug={event.projectSlug}
                      projectName={event.projectName ?? "Project unavailable"}
                      projectAvailable={event.projectAvailable}
                    />
                  </td>
                ) : null}
                <td className="px-4 py-3 align-top">
                  <ActivityUserLink
                    actorId={event.actorId}
                    actorName={userLabel}
                    eventType={event.type}
                    linkableUserIds={linkableUsers}
                  />
                </td>
                <td className={`activity-message px-4 py-3 align-top ${messageClassName}`}>
                  {event.displayDescription ?? event.message}
                </td>
                <td className="px-4 py-3 align-top text-muted">
                  <time dateTime={event.createdAt} title={formatActivityTableDateTitle(event.createdAt)}>
                    {formatActivityTableDate(event.createdAt)}
                  </time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
