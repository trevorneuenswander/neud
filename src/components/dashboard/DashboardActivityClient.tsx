"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageSection } from "@/components/portal/PageSection";
import { CompactActivityTable } from "@/components/activity/CompactActivityTable";
import { getCleanActivityDescription } from "@/lib/activity/description";
import { useLinkableUserIds } from "@/lib/activity/use-linkable-user-ids";
import { useActivitySession } from "@/lib/desktop/activity-session-client";
import { normalizeActivityEventsForProjects } from "@/lib/activity/normalize";
import type { ActivityDisplayEvent, ActivityProjectSummary } from "@/lib/activity/types";
import type { DashboardActivityItem } from "@/lib/dashboard/types";
import { localListProjects } from "@/lib/local/api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type DashboardActivityClientProps = {
  initialActivity: DashboardActivityItem[];
};

function toProjectSummaries(
  projects: Array<{ id: string; slug: string; name: string; description?: string | null }>,
): ActivityProjectSummary[] {
  return projects.map((project) => ({
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description ?? null,
  }));
}

function normalizeInitialActivity(
  initialActivity: DashboardActivityItem[],
): ActivityDisplayEvent[] {
  return initialActivity.map((item) => {
    const actorName = item.actorName || "System";
    const message = getCleanActivityDescription(
      item.message || "Activity recorded",
      actorName,
    );
    return {
      id: item.id,
      projectId: item.projectId,
      projectSlug: item.projectSlug,
      projectName: item.projectName,
      projectAvailable: true,
      actorId: item.actorId,
      actorName,
      message,
      displayDescription: message,
      createdAt: item.createdAt,
      type: item.type,
    };
  });
}

export function DashboardActivityClient({
  initialActivity,
}: DashboardActivityClientProps) {
  const { entries } = useActivitySession();
  const linkableUserIds = useLinkableUserIds();
  const [projects, setProjects] = useState<ActivityProjectSummary[]>(() =>
    initialActivity.map((item) => ({
      id: item.projectId,
      slug: item.projectSlug,
      name: item.projectName,
    })),
  );

  useEffect(() => {
    if (!shouldUseLocalDataClient()) return;
    void localListProjects()
      .then((result) => {
        const list = (result.projects as Array<{
          id: string;
          slug: string;
          name: string;
          description?: string | null;
        }>).map((project) => ({
          id: project.id,
          slug: project.slug,
          name: project.name,
          description: project.description ?? null,
        }));
        setProjects(toProjectSummaries(list));
      })
      .catch(() => {
        // Keep the last known project summaries.
      });
  }, []);

  const displayEvents = useMemo(() => {
    if (shouldUseLocalDataClient() && entries.length > 0) {
      return normalizeActivityEventsForProjects({
        events: entries,
        projects,
      });
    }
    return normalizeInitialActivity(initialActivity);
  }, [entries, initialActivity, projects]);

  return (
    <PageSection
      title="Recent Activity"
      actions={
        <Button href="/activity" variant="secondary" size="sm">
          View Full Activity
        </Button>
      }
    >
      <CompactActivityTable
        events={displayEvents}
        showProjectColumn
        contextKey="dashboard"
        pinToLatest
        emptyTitle="No activity yet"
        linkableUserIds={linkableUserIds}
      />
    </PageSection>
  );
}
