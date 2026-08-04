import Link from "next/link";
import { Card } from "@/components/ui/Card";
import {
  formatHostedAbsoluteTimestamp,
  formatHostedRelativeTimestamp,
} from "@/lib/hosted/format-hosted-timestamp";
import { HOSTED_PORTAL_PATHS } from "@/lib/routing/hosted-routes";
import { sortActivityEventsNewestFirst } from "@/lib/activity/sort";
import type { HostedActivityEvent } from "@/lib/hosted/activity-queries";

type HostedRecentActivityProps = {
  events: HostedActivityEvent[];
};

export function HostedRecentActivity({ events }: HostedRecentActivityProps) {
  const displayEvents = sortActivityEventsNewestFirst(events);
  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Recent Activity</h2>
        <Link href={HOSTED_PORTAL_PATHS.activity} className="text-sm text-primary hover:underline">
          View all activity
        </Link>
      </div>
      {displayEvents.length === 0 ? (
        <p className="text-sm text-muted">No recent activity to show.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {displayEvents.map((event) => (
            <li key={event.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  {event.projectName ? (
                    <p className="text-sm font-medium text-foreground">{event.projectName}</p>
                  ) : null}
                  <p className="text-sm text-muted">{event.description}</p>
                  {event.actorName ? (
                    <p className="text-xs text-muted">{event.actorName}</p>
                  ) : null}
                </div>
                <time
                  className="shrink-0 text-xs text-muted"
                  dateTime={event.occurredAt}
                  title={formatHostedAbsoluteTimestamp(event.occurredAt) ?? undefined}
                >
                  {formatHostedRelativeTimestamp(event.occurredAt)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
