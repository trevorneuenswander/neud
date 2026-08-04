"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ProjectVisibilityBadge,
  projectListVisibility,
} from "@/components/projects/ProjectVisibilityBadge";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/DataTable";
import { formatProjectDate, formatProjectDataType } from "@/lib/projects/format";
import type { ProjectListItem } from "@/lib/projects/types";
import type { ProjectDataType } from "@/lib/projects/constants";

type ProjectListProps = {
  projects: ProjectListItem[];
  viewerMode?: boolean;
};

function projectHref(slug: string, viewerMode: boolean) {
  return viewerMode ? `/projects/${slug}/displays` : `/projects/${slug}`;
}

function formatListDataType(projectType: ProjectDataType): string {
  if (projectType === "bag-graphics") {
    return "Webpage Scraper";
  }
  return formatProjectDataType(projectType);
}

export function ProjectList({ projects, viewerMode = false }: ProjectListProps) {
  const router = useRouter();

  return (
    <>
      <div className="hidden md:block">
        <DataTable>
          <DataTableHead>
            <DataTableHeaderCell>Project</DataTableHeaderCell>
            <DataTableHeaderCell>Data Type</DataTableHeaderCell>
            <DataTableHeaderCell>Status</DataTableHeaderCell>
            <DataTableHeaderCell>Last Updated</DataTableHeaderCell>
          </DataTableHead>
          <DataTableBody>
            {projects.map((project) => (
              <DataTableRow
                key={project.id}
                className="cursor-pointer transition-colors hover:bg-surface-raised"
                onClick={() => router.push(projectHref(project.slug, viewerMode))}
              >
                <DataTableCell>
                  <div>
                    <Link
                      href={projectHref(project.slug, viewerMode)}
                      className="font-medium text-foreground hover:underline focus-visible:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {project.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {project.teams && project.teams.length > 0 ? (
                        project.teams.map((team) => (
                          <span
                            key={team.id}
                            className="inline-flex items-center rounded-full border border-border bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-muted"
                          >
                            {team.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted">Unassigned</span>
                      )}
                    </div>
                  </div>
                </DataTableCell>
                <DataTableCell>{formatListDataType(project.project_type)}</DataTableCell>
                <DataTableCell>
                  <ProjectVisibilityBadge
                    isActive={projectListVisibility(project)}
                  />
                </DataTableCell>
                <DataTableCell className="text-muted">
                  {formatProjectDate(project.updated_at)}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      </div>

      <div className="grid gap-4 md:hidden">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={projectHref(project.slug, viewerMode)}
            className="rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-raised"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{project.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {project.teams && project.teams.length > 0 ? (
                    project.teams.map((team) => (
                      <span
                        key={team.id}
                        className="inline-flex items-center rounded-full border border-border bg-surface-raised px-2 py-0.5 text-xs font-medium text-muted"
                      >
                        {team.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted">Unassigned</span>
                  )}
                </div>
              </div>
              <ProjectVisibilityBadge isActive={projectListVisibility(project)} />
            </div>
            <div className="mt-3 text-sm text-muted">
              {formatListDataType(project.project_type)}
            </div>
            <p className="mt-3 text-xs text-muted">
              Last updated {formatProjectDate(project.updated_at)}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
