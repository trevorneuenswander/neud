"use client";

import type { ReactNode } from "react";
import { ProjectTopMenuBar } from "@/components/projects/ProjectTopMenuBar";
import type { ProjectDataType } from "@/lib/projects/constants";
import type { DisplayDataSource } from "@/lib/displays/display-data-source";

type ProjectLayoutFrameProps = {
  slug: string;
  projectType: ProjectDataType;
  engineId: string | null;
  canManageSettings: boolean;
  projectRole?: import("@/lib/projects/project-permissions").ProjectRole;
  showStatusControls: boolean;
  initialDataSource?: DisplayDataSource;
  children: ReactNode;
};

export function ProjectLayoutFrame({
  slug,
  projectType,
  engineId,
  canManageSettings,
  projectRole,
  showStatusControls,
  initialDataSource,
  children,
}: ProjectLayoutFrameProps) {
  return (
    <div className="project-layout-root flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <ProjectTopMenuBar
        slug={slug}
        projectType={projectType}
        engineId={engineId}
        canManageSettings={canManageSettings}
        projectRole={projectRole}
        showStatusControls={showStatusControls}
        initialDataSource={initialDataSource}
      />
      <div className="project-layout-frame min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pb-6 pt-6 lg:px-6">{children}</div>
      </div>
    </div>
  );
}
