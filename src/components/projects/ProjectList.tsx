"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ProjectVisibilityBadge,
  projectListVisibility,
} from "@/components/projects/ProjectVisibilityBadge";
import { ProjectPackageActions } from "@/components/projects/ProjectPackageActions";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/DataTable";
import { ProjectCapabilityTags } from "@/components/projects/ProjectCapabilityTags";
import { formatProjectDate } from "@/lib/projects/format";
import { buildProjectLandingHref } from "@/lib/projects/project-landing-route";
import type { ProjectListItem } from "@/lib/projects/types";
import { defaultCapabilitiesForProjectType } from "@/lib/projects/capabilities";

type ProjectListProps = {
  projects: ProjectListItem[];
  viewerMode?: boolean;
  onPackageChanged?: () => void;
};

function formatProjectTeamNames(teams?: Array<{ name: string }>): string {
  if (!teams?.length) {
    return "—";
  }
  return teams.map((team) => team.name).join(", ");
}

export function ProjectList({
  projects,
  viewerMode = false,
  onPackageChanged,
}: ProjectListProps) {
  const router = useRouter();

  return (
    <>
      <div className="hidden md:block">
        <DataTable>
          <DataTableHead>
            <DataTableHeaderCell>Project</DataTableHeaderCell>
            <DataTableHeaderCell>Type</DataTableHeaderCell>
            <DataTableHeaderCell>Team</DataTableHeaderCell>
            <DataTableHeaderCell>Status</DataTableHeaderCell>
            <DataTableHeaderCell>Package</DataTableHeaderCell>
            <DataTableHeaderCell>Last Updated</DataTableHeaderCell>
          </DataTableHead>
          <DataTableBody>
            {projects.map((project) => {
              const canOpen =
                project.packageState == null ||
                project.packageState === "downloaded" ||
                project.packageState === "update_available";
              return (
              <DataTableRow
                key={project.id}
                className={
                  canOpen
                    ? "cursor-pointer transition-colors hover:bg-surface-raised"
                    : "transition-colors"
                }
                onClick={() => {
                  if (canOpen) {
                    router.push(buildProjectLandingHref(project.slug, viewerMode));
                  }
                }}
              >
                <DataTableCell>
                  {canOpen ? (
                    <Link
                      href={buildProjectLandingHref(project.slug, viewerMode)}
                      className="font-medium text-foreground hover:underline focus-visible:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {project.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{project.name}</span>
                  )}
                </DataTableCell>
                <DataTableCell className="text-left align-top">
                  <ProjectCapabilityTags
                    capabilities={
                      project.capabilities?.length
                        ? project.capabilities
                        : defaultCapabilitiesForProjectType(project.project_type)
                    }
                  />
                </DataTableCell>
                <DataTableCell className="text-muted">
                  {formatProjectTeamNames(project.teams)}
                </DataTableCell>
                <DataTableCell>
                  <ProjectVisibilityBadge
                    isActive={projectListVisibility(project)}
                  />
                </DataTableCell>
                <DataTableCell>
                  <ProjectPackageActions
                    project={project}
                    viewerMode={viewerMode}
                    onChanged={onPackageChanged}
                  />
                </DataTableCell>
                <DataTableCell className="text-muted">
                  {formatProjectDate(project.updated_at)}
                </DataTableCell>
              </DataTableRow>
            );
            })}
          </DataTableBody>
        </DataTable>
      </div>

      <div className="grid gap-4 md:hidden">
        {projects.map((project) => (
          <div
            key={project.id}
            className="rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-raised"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{project.name}</p>
                <div className="mt-2">
                  <ProjectCapabilityTags
                    capabilities={
                      project.capabilities?.length
                        ? project.capabilities
                        : defaultCapabilitiesForProjectType(project.project_type)
                    }
                  />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {formatProjectTeamNames(project.teams)}
                </p>
              </div>
              <ProjectVisibilityBadge isActive={projectListVisibility(project)} />
            </div>
            <div className="mt-3">
              <ProjectPackageActions
                project={project}
                viewerMode={viewerMode}
                onChanged={onPackageChanged}
              />
            </div>
            <p className="mt-3 text-xs text-muted">
              Last updated {formatProjectDate(project.updated_at)}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
