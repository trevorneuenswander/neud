"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PinnedDisplayViewerArea } from "@/components/displays/PinnedDisplayViewerArea";
import { ProjectTopMenuBar } from "@/components/projects/ProjectTopMenuBar";
import type { ProjectDataType } from "@/lib/projects/constants";
import type { DisplayDataSource } from "@/lib/displays/display-data-source";

type ProjectLayoutFrameProps = {
  slug: string;
  projectType: ProjectDataType;
  capabilities?: string[] | null;
  engineId: string | null;
  canManageSettings: boolean;
  projectRole?: import("@/lib/projects/project-permissions").ProjectRole;
  showStatusControls: boolean;
  initialDataSource?: DisplayDataSource;
  children: ReactNode;
};

/**
 * Keep project page content scrolled to the top of the correct scroll container.
 * Prevents intermittent upward clipping when route mounts focus iframes/previews
 * that would otherwise scroll an ancestor past the title bar.
 */
function useResetProjectContentScroll(pathname: string) {
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (frame) {
      frame.scrollTop = 0;
    }
    // Defensive: never leave the shell/window scrolled when route content changes.
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
      const shell = document.getElementById("neud-app-content");
      if (shell) shell.scrollTop = 0;
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, [pathname]);

  return frameRef;
}

export function ProjectLayoutFrame({
  slug,
  projectType,
  capabilities,
  engineId,
  canManageSettings,
  projectRole,
  showStatusControls,
  initialDataSource,
  children,
}: ProjectLayoutFrameProps) {
  const pathname = usePathname() ?? "";
  const frameRef = useResetProjectContentScroll(pathname);

  return (
    <div className="project-layout-root flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <PinnedDisplayViewerArea />
      <ProjectTopMenuBar
        slug={slug}
        projectType={projectType}
        capabilities={capabilities}
        engineId={engineId}
        canManageSettings={canManageSettings}
        projectRole={projectRole}
        showStatusControls={showStatusControls}
        initialDataSource={initialDataSource}
      />
      <div
        ref={frameRef}
        className="project-layout-frame min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
      >
        <div className="px-4 pb-6 pt-6 lg:px-6">{children}</div>
      </div>
    </div>
  );
}
