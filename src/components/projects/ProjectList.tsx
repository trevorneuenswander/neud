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
import { formatProjectDate } from "@/lib/projects/format";
import { buildProjectLandingHref } from "@/lib/projects/project-landing-route";
import type { ProjectListItem } from "@/lib/projects/types";

type ProjectListProps = {
  projects: ProjectListItem[];
  viewerMode?: boolean;
};

function formatProjectTeamNames(teams?: Array<{ name: string }>): string {
  if (!teams?.length) {
    return "—";
  }
  return teams.map((team) => team.name).join(", ");
}

export function ProjectList({ projects, viewerMode = false }: ProjectListProps) {
  const router = useRouter();

  return (
    <>
      <div className="hidden md:block">
        <DataTable>
          <DataTableHead>
            <DataTableHeaderCell>Project</DataTableHeaderCell>
            <DataTableHeaderCell>Team</DataTableHeaderCell>
            <DataTableHeaderCell>Status</DataTableHeaderCell>
            <DataTableHeaderCell>Last Updated</DataTableHeaderCell>
          </DataTableHead>
          <DataTableBody>
            {projects.map((project) => (
              <DataTableRow
                key={project.id}
                className="cursor-pointer transition-colors hover:bg-surface-raised"
                onClick={() =>
                  router.push(buildProjectLandingHref(project.slug, viewerMode))
                }
              >
                <DataTableCell>
                  <Link
                    href={buildProjectLandingHref(project.slug, viewerMode)}
                    className="font-medium text-foreground hover:underline focus-visible:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {project.name}
                  </Link>
                </DataTableCell>
                <DataTableCell className="text-muted">
                  {formatProjectTeamNames(project.teams)}
                </DataTableCell>
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
            href={buildProjectLandingHref(project.slug, viewerMode)}
            className="rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-raised"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{project.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {formatProjectTeamNames(project.teams)}
                </p>
              </div>
              <ProjectVisibilityBadge isActive={projectListVisibility(project)} />
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
