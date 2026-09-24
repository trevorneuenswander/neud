"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { useSidebarProjects } from "@/hooks/useSidebarProjects";
import {
  buildProjectLandingHref,
  extractProjectSlugFromPathname,
} from "@/lib/projects/project-landing-route";
import { isProjectWorkspacePath } from "@/lib/portal/navigation";
import {
  readSidebarProjectsExpandedPreference,
  writeSidebarProjectsExpandedPreference,
} from "@/lib/portal/sidebar-projects-preference";
import type { ProjectListItem } from "@/lib/projects/types";
import {
  SIDEBAR_PRIMARY_NAV_CHEVRON_CLASS,
  SIDEBAR_PRIMARY_NAV_ROW_CLASS,
  sidebarPrimaryNavActiveClass,
  sidebarPrimaryNavInactiveClass,
} from "@/lib/portal/sidebar-nav-item-classes";

type SidebarProjectsNavProps = {
  initialProjects?: ProjectListItem[];
  initialViewerMode?: boolean;
  onNavigate?: () => void;
};

function resolveProjectsNavActive(pathname: string): boolean {
  const normalized = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return normalized === "/projects" || isProjectWorkspacePath(normalized);
}

export function SidebarProjectsNav({
  initialProjects,
  initialViewerMode,
  onNavigate,
}: SidebarProjectsNavProps) {
  const pathname = usePathname();
  const submenuId = useId();
  const { projects, viewerMode, hasLoaded } = useSidebarProjects({
    initialProjects,
    initialViewerMode,
  });
  const activeSlug = extractProjectSlugFromPathname(pathname);
  const parentActive = resolveProjectsNavActive(pathname);
  const inProjectWorkspace = isProjectWorkspacePath(
    pathname.split("?")[0]?.split("#")[0] ?? pathname,
  );

  const [expanded, setExpanded] = useState(() => {
    if (inProjectWorkspace) {
      return true;
    }
    return readSidebarProjectsExpandedPreference() ?? false;
  });

  useEffect(() => {
    if (inProjectWorkspace) {
      setExpanded(true);
      return;
    }
    const stored = readSidebarProjectsExpandedPreference();
    if (stored !== null) {
      setExpanded(stored);
    }
  }, [inProjectWorkspace]);

  function toggleExpanded() {
    setExpanded((current) => {
      const next = !current;
      if (!inProjectWorkspace) {
        writeSidebarProjectsExpandedPreference(next);
      }
      return next;
    });
  }

  const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

  return (
    <div className="space-y-0.5" style={noDragStyle}>
      <div className="flex h-10 items-stretch gap-0.5">
        <Link
          href="/projects"
          onClick={onNavigate}
          aria-current={parentActive && !activeSlug ? "page" : undefined}
          className={`${SIDEBAR_PRIMARY_NAV_ROW_CLASS} min-w-0 flex-1 ${
            parentActive && !activeSlug
              ? sidebarPrimaryNavActiveClass
              : parentActive
                ? "text-foreground hover:bg-surface-raised"
                : sidebarPrimaryNavInactiveClass
          }`}
        >
          Projects
        </Link>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-controls={submenuId}
          aria-label={expanded ? "Collapse projects list" : "Expand projects list"}
          className={SIDEBAR_PRIMARY_NAV_CHEVRON_CLASS}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {expanded ? (
        <ul
          id={submenuId}
          className="ml-3 max-h-52 space-y-0.5 overflow-y-auto border-l border-border/70 pl-2"
          aria-label="Projects"
        >
          {!hasLoaded && projects.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted">Loading…</li>
          ) : null}
          {hasLoaded && projects.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted">No projects</li>
          ) : null}
          {projects.map((project) => {
            const slug = String(project.slug ?? "").trim();
            if (!slug) {
              return null;
            }
            const href = buildProjectLandingHref(slug, viewerMode);
            const isActive = activeSlug === slug;
            return (
              <li key={project.id}>
                <Link
                  href={href}
                  title={project.name}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={`block truncate rounded-md px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/15 font-medium text-foreground"
                      : "text-muted hover:bg-surface-raised hover:text-foreground"
                  }`}
                >
                  {project.name}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
