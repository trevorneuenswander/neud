"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CompactActivityTable } from "@/components/activity/CompactActivityTable";
import { ProjectSummaryCard } from "@/components/projects/ProjectSummaryCard";
import { formatHostedRelativeTimestamp } from "@/lib/hosted/format-hosted-timestamp";
import { formatActiveDisplayCount } from "@/lib/hosted/format-active-display-count";
import { HOSTED_PORTAL_PATHS } from "@/lib/routing/hosted-routes";
import type { HostedActivityEvent } from "@/lib/hosted/activity-queries";
import type { ActivityDisplayEvent } from "@/lib/activity/types";

type HostedDashboardProject = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  activeDisplayCount: number;
  onlineDisplayCount: number;
};

type HostedPortalDashboardClientProps = {
  projectCount: number;
  onlineDisplayCount: number;
  activePublisherCount: number;
  lastSyncAt: string | null;
  projects: HostedDashboardProject[];
  recentActivity: HostedActivityEvent[];
};

function mapHostedActivityEvents(events: HostedActivityEvent[]): ActivityDisplayEvent[] {
  return events.map((event) => ({
    id: event.id,
    projectId: event.projectId ?? "",
    projectSlug: event.projectSlug ?? undefined,
    projectName: event.projectName ?? undefined,
    projectAvailable: Boolean(event.projectSlug),
    actorId: undefined,
    actorName: event.actorName ?? "System",
    message: event.description,
    displayDescription: event.description,
    createdAt: event.occurredAt,
    type: event.eventType,
  }));
}

export function HostedPortalDashboardClient({
  projectCount,
  onlineDisplayCount,
  activePublisherCount,
  lastSyncAt,
  projects,
  recentActivity,
}: HostedPortalDashboardClientProps) {
  const lastSyncRelative = formatHostedRelativeTimestamp(lastSyncAt);
  const activityEvents = mapHostedActivityEvents(recentActivity);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Projects</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{projectCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Online displays</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{onlineDisplayCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Publishing desktops</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{activePublisherCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Last sync</p>
          <p className="mt-1 text-sm font-semibold text-foreground" title={lastSyncAt ?? undefined}>
            {lastSyncRelative}
          </p>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">Recent Projects</h2>
          <Button href={HOSTED_PORTAL_PATHS.projects} variant="ghost" size="sm">
            View all
          </Button>
        </div>
        {projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center">
            <p className="text-sm text-muted">
              No hosted projects are available yet. Register projects from the NEUD desktop app.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {projects.map((project) => (
              <ProjectSummaryCard
                key={project.id}
                project={{
                  id: project.id,
                  slug: project.slug,
                  name: project.name,
                  description: project.description,
                  href: HOSTED_PORTAL_PATHS.projectDisplays(project.slug),
                  metaLabel: formatActiveDisplayCount(project.activeDisplayCount),
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
          <Button href={HOSTED_PORTAL_PATHS.activity} variant="secondary" size="sm">
            View all activity
          </Button>
        </div>
        <CompactActivityTable
          events={activityEvents}
          showProjectColumn
          contextKey="hosted-dashboard"
          pinToLatest
          emptyTitle="No activity yet"
        />
      </section>
    </div>
  );
}
