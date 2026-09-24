"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { localGetProjectsMeta } from "@/lib/local/displays-api";
import { localListProjects } from "@/lib/local/api";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { resolveProjectsViewerMode } from "@/lib/projects/project-landing-route";
import type { ProjectListItem } from "@/lib/projects/types";

type UseSidebarProjectsOptions = {
  initialProjects?: ProjectListItem[];
  initialViewerMode?: boolean;
};

export function useSidebarProjects(options: UseSidebarProjectsOptions = {}) {
  const isLocalMode = shouldUseLocalDataClient();
  const pathname = usePathname();
  const [projects, setProjects] = useState<ProjectListItem[]>(
    options.initialProjects ?? [],
  );
  const [viewerMode, setViewerMode] = useState(options.initialViewerMode ?? false);
  const [hasLoaded, setHasLoaded] = useState(
    !isLocalMode && (options.initialProjects?.length ?? 0) > 0,
  );
  const loadingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (loadingRef.current) {
      return;
    }
    loadingRef.current = true;
    try {
      if (isLocalMode) {
        const meta = await localGetProjectsMeta({ wait: false });
        setViewerMode(resolveProjectsViewerMode(meta));
        const list = await localListProjects();
        setProjects(list.projects as ProjectListItem[]);
      } else if (options.initialProjects) {
        setProjects(options.initialProjects);
      }
      setHasLoaded(true);
    } catch {
      // keep cached list
      setHasLoaded(true);
    } finally {
      loadingRef.current = false;
    }
  }, [isLocalMode, options.initialProjects]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isLocalMode) {
      return;
    }
    if (pathname === "/projects" || pathname.startsWith("/projects/new")) {
      void refresh();
    }
  }, [isLocalMode, pathname, refresh]);

  return {
    projects,
    viewerMode,
    hasLoaded,
    refresh,
    isLocalMode,
  };
}
