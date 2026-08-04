"use client";

import { Card } from "@/components/ui/Card";
import { ActivityEmptyState } from "@/components/activity/ActivityEmptyState";
import { ActivityFullView } from "@/components/activity/ActivityFullView";
import { shouldUseLocalDataClient } from "@/lib/local/mode";

type ProjectActivityFullViewProps = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  projectEngineIds?: string[];
};

export function ProjectActivityFullView({
  projectId,
  projectSlug,
  projectName,
  projectEngineIds = [],
}: ProjectActivityFullViewProps) {
  if (!shouldUseLocalDataClient()) {
    return (
      <Card>
        <ActivityEmptyState
          title="Activity unavailable"
          description="Activity logging is available in the desktop app."
        />
      </Card>
    );
  }

  return (
    <ActivityFullView
      scope="project"
      projectId={projectId}
      projectSlug={projectSlug}
      projectName={projectName}
      projectEngineIds={projectEngineIds}
    />
  );
}
