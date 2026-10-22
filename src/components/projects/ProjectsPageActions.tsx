"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { NewProjectWizard } from "@/components/projects/NewProjectWizard";
import { ProjectsRefreshButton } from "@/components/projects/ProjectsRefreshButton";

type ProjectsPageActionsProps = {
  canCreateProject: boolean;
  showRefresh?: boolean;
};

export function ProjectsPageActions({
  canCreateProject,
  showRefresh = false,
}: ProjectsPageActionsProps) {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        {showRefresh ? <ProjectsRefreshButton /> : null}
        {canCreateProject ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setWizardOpen(true)}
          >
            New Project
          </Button>
        ) : null}
      </div>
      <NewProjectWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
      />
    </>
  );
}
