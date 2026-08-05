"use client";

import { forwardRef, useLayoutEffect, useRef } from "react";
import type { ProjectDataType } from "@/lib/projects/constants";
import { ProjectNav } from "@/components/projects/ProjectNav";
import { ProjectLastPollStatus } from "@/components/projects/ProjectLastPollStatus";
import { ProjectDataSourceSelector } from "@/components/projects/ProjectDataSourceSelector";
import type { DisplayDataSource } from "@/lib/displays/display-data-source";
import { useProjectNavLayoutMode } from "@/hooks/useProjectNavLayoutMode";

type ProjectTopMenuBarProps = {
  slug: string;
  projectType: ProjectDataType;
  engineId: string | null;
  canManageSettings: boolean;
  projectRole?: import("@/lib/projects/project-permissions").ProjectRole;
  showStatusControls: boolean;
  initialDataSource?: DisplayDataSource;
};

export const ProjectTopMenuBar = forwardRef<HTMLDivElement, ProjectTopMenuBarProps>(
  function ProjectTopMenuBar(
    {
      slug,
      projectType,
      engineId,
      canManageSettings,
      projectRole,
      showStatusControls,
      initialDataSource,
    },
    ref,
  ) {
    const rowRef = useRef<HTMLDivElement>(null);
    const navMeasureRef = useRef<HTMLDivElement>(null);
    const statusRef = useRef<HTMLDivElement>(null);

    const layoutMode = useProjectNavLayoutMode({
      containerRef: rowRef,
      navMeasureRef,
      statusRef: showStatusControls ? statusRef : { current: null },
      reservedWidth: 56,
    });

    useLayoutEffect(() => {
      const header = typeof ref === "function" ? null : ref?.current;
      if (!header) return;

      const syncNavigationHeight = () => {
        const height = Math.ceil(header.getBoundingClientRect().height);
        document.documentElement.style.setProperty("--navigation-bar-height", `${height}px`);
      };

      syncNavigationHeight();
      const observer = new ResizeObserver(syncNavigationHeight);
      observer.observe(header);

      return () => {
        observer.disconnect();
        document.documentElement.style.removeProperty("--navigation-bar-height");
      };
    }, [ref]);

    return (
      <div
        ref={ref}
        className="project-top-menu shrink-0 border-b border-border bg-background px-4 py-3 lg:px-6"
      >
        <div ref={rowRef} className="flex min-h-[52px] min-w-0 items-center gap-4">
          <ProjectNav
            slug={slug}
            projectType={projectType}
            canManageSettings={canManageSettings}
            projectRole={projectRole}
            layoutMode={layoutMode}
            navMeasureRef={navMeasureRef}
          />
          {showStatusControls ? (
            <div
              ref={statusRef}
              className="ml-auto flex shrink-0 items-center gap-4"
            >
              <ProjectLastPollStatus engineId={engineId} />
              <ProjectDataSourceSelector initialDataSource={initialDataSource} />
            </div>
          ) : null}
        </div>
      </div>
    );
  },
);

ProjectTopMenuBar.displayName = "ProjectTopMenuBar";
