"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CompactActivityTable } from "@/components/activity/CompactActivityTable";
import { ActivityEmptyState } from "@/components/activity/ActivityEmptyState";
import { useProjectActivityEntries } from "@/lib/desktop/activity-session-client";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { normalizeActivityEventsForProjects } from "@/lib/activity/normalize";
import { useLinkableUserIds } from "@/lib/activity/use-linkable-user-ids";
import type { ActivityProjectSummary } from "@/lib/activity/types";

type ProjectActivityPanelProps = {
  projectId: string;
  projectName: string;
  projectSlug?: string;
  projectEngineIds?: string[];
};

export function ProjectActivityPanel({
  projectId,
  projectName,
  projectSlug,
  projectEngineIds = [],
}: ProjectActivityPanelProps) {
  if (!shouldUseLocalDataClient()) {
    return (
      <Card className="flex flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Activity</h3>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          <ActivityEmptyState
            title="No activity recorded"
            description="Activity logging is available in the desktop app."
          />
        </div>
      </Card>
    );
  }

  return (
    <DesktopProjectActivityPanel
      projectId={projectId}
      projectName={projectName}
      projectSlug={projectSlug}
      projectEngineIds={projectEngineIds}
    />
  );
}

function DesktopProjectActivityPanel({
  projectId,
  projectName,
  projectSlug: projectSlugProp,
  projectEngineIds,
}: {
  projectId: string;
  projectName: string;
  projectSlug?: string;
  projectEngineIds: string[];
}) {
  const params = useParams<{ slug: string }>();
  const slug = projectSlugProp ?? params.slug;
  const linkableUserIds = useLinkableUserIds();
  const projectEntries = useProjectActivityEntries({
    projectId,
    projectSlug: slug,
    projectEngineIds,
  });

  const displayEvents = useMemo(() => {
    const metadataProjects = new Map<string, ActivityProjectSummary>();
    for (const entry of projectEntries) {
      const metadata = entry.metadata ?? {};
      const id = typeof metadata.projectId === "string" ? metadata.projectId : projectId;
      const entrySlug =
        typeof metadata.projectSlug === "string" ? metadata.projectSlug : slug;
      const name =
        typeof metadata.projectName === "string" ? metadata.projectName : projectName;
      if (id) {
        metadataProjects.set(id, { id, slug: entrySlug, name });
      }
    }

    metadataProjects.set(projectId, {
      id: projectId,
      slug,
      name: projectName,
    });

    return normalizeActivityEventsForProjects({
      events: projectEntries,
      projects: [...metadataProjects.values()],
      projectId,
      projectSlug: slug,
      projectEngineIds,
    });
  }, [projectEntries, projectEngineIds, projectId, projectName, slug]);

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Activity</h3>
        <Button href={`/projects/${slug}/activity`} type="button" size="sm" variant="secondary">
          View Full Activity
        </Button>
      </div>
      <div className="mt-4 min-h-0">
        <CompactActivityTable
          events={displayEvents}
          contextKey={projectId}
          emptyTitle="No activity yet"
          linkableUserIds={linkableUserIds}
        />
      </div>
    </Card>
  );
}
