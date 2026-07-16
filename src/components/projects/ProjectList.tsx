import Link from "next/link";
import { ProjectAccessBadge } from "@/components/projects/ProjectAccessBadge";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { ProjectTypeLabel } from "@/components/projects/ProjectTypeLabel";
import { Button } from "@/components/ui/Button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/DataTable";
import {
  formatProjectDate,
  formatProjectNumber,
} from "@/lib/projects/format";
import type { ProjectListItem } from "@/lib/projects/types";

type ProjectListProps = {
  projects: ProjectListItem[];
};

export function ProjectList({ projects }: ProjectListProps) {
  return (
    <>
      <div className="hidden md:block">
        <DataTable>
          <DataTableHead>
            <DataTableHeaderCell>Project</DataTableHeaderCell>
            <DataTableHeaderCell>Type</DataTableHeaderCell>
            <DataTableHeaderCell>Status</DataTableHeaderCell>
            <DataTableHeaderCell>Access</DataTableHeaderCell>
            <DataTableHeaderCell>Updated</DataTableHeaderCell>
            <DataTableHeaderCell>
              <span className="sr-only">Actions</span>
            </DataTableHeaderCell>
          </DataTableHead>
          <DataTableBody>
            {projects.map((project) => (
              <DataTableRow key={project.id}>
                <DataTableCell>
                  <div>
                    <p className="font-medium text-foreground">{project.name}</p>
                    <p className="text-xs text-muted">
                      {formatProjectNumber(project.project_number)}
                    </p>
                  </div>
                </DataTableCell>
                <DataTableCell>
                  <ProjectTypeLabel projectType={project.project_type} />
                </DataTableCell>
                <DataTableCell>
                  <ProjectStatusBadge status={project.status} />
                </DataTableCell>
                <DataTableCell>
                  <ProjectAccessBadge accessLevel={project.accessLevel} />
                </DataTableCell>
                <DataTableCell className="text-muted">
                  {formatProjectDate(project.updated_at)}
                </DataTableCell>
                <DataTableCell>
                  <Button href={`/projects/${project.slug}`} variant="secondary" size="sm">
                    Open Project
                  </Button>
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
            href={`/projects/${project.slug}`}
            className="rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-raised"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{project.name}</p>
                <p className="text-xs text-muted">
                  {formatProjectNumber(project.project_number)}
                </p>
              </div>
              <ProjectStatusBadge status={project.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
              <ProjectTypeLabel projectType={project.project_type} />
              <ProjectAccessBadge accessLevel={project.accessLevel} />
            </div>
            <p className="mt-3 text-xs text-muted">
              Updated {formatProjectDate(project.updated_at)}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
