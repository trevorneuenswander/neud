"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  formatHostedAbsoluteTimestamp,
  formatHostedRelativeTimestamp,
} from "@/lib/hosted/format-hosted-timestamp";
import { HOSTED_PORTAL_PATHS } from "@/lib/routing/hosted-routes";
import type { HostedActivityEvent } from "@/lib/hosted/activity-queries";

type HostedActivityFeedProps = {
  events: HostedActivityEvent[];
  projects: Array<{ id: string; slug: string; name: string }>;
  showProjectFilter?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function HostedActivityFeed({
  events,
  projects,
  showProjectFilter = true,
  emptyTitle = "No activity yet",
  emptyDescription = "Operational events from your hosted projects will appear here.",
}: HostedActivityFeedProps) {
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const filteredEvents = useMemo(() => {
    if (projectFilter === "all") {
      return events;
    }
    return events.filter((event) => event.projectId === projectFilter);
  }, [events, projectFilter]);

  return (
    <div className="space-y-4">
      {showProjectFilter && projects.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="hosted-activity-project-filter" className="text-sm text-muted">
            Project
          </label>
          <select
            id="hosted-activity-project-filter"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-foreground"
          >
            <option value="all">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <Card className="divide-y divide-border overflow-hidden">
        {filteredEvents.length === 0 ? (
          <div className="p-6">
            <EmptyState title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          filteredEvents.map((event) => {
            const href = event.projectSlug
              ? HOSTED_PORTAL_PATHS.projectDisplays(event.projectSlug)
              : undefined;
            const absoluteTime = formatHostedAbsoluteTimestamp(event.occurredAt);
            const relativeTime = formatHostedRelativeTimestamp(event.occurredAt);

            const row = (
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  {event.projectName ? (
                    <p className="text-sm font-medium text-foreground">{event.projectName}</p>
                  ) : null}
                  {event.actorName ? (
                    <p className="text-xs text-muted">{event.actorName}</p>
                  ) : null}
                  <p className="text-sm text-foreground">{event.description}</p>
                </div>
                <time
                  className="shrink-0 text-xs text-muted"
                  dateTime={event.occurredAt}
                  title={absoluteTime ?? undefined}
                >
                  {relativeTime}
                </time>
              </div>
            );

            if (href) {
              return (
                <Link
                  key={event.id}
                  href={href}
                  className="block transition-colors hover:bg-surface-raised/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  {row}
                </Link>
              );
            }

            return (
              <div key={event.id} className="bg-surface">
                {row}
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
