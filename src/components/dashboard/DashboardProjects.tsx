import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProjectAccessBadge } from "@/components/projects/ProjectAccessBadge";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { ProjectTypeLabel } from "@/components/projects/ProjectTypeLabel";
import {
  formatProjectDate,
  formatProjectNumber,
} from "@/lib/projects/format";
import type { ProjectListItem } from "@/lib/projects/types";

type DashboardProjectsProps = {
  projects: ProjectListItem[];
  showNewProjectAction: boolean;
};

export function DashboardProjects({
  projects,
  showNewProjectAction,
}: DashboardProjectsProps) {
  if (projects.length === 0) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">Projects</h2>
          {showNewProjectAction ? (
            <Button href="/projects/new" variant="secondary" size="sm">
              New Project
            </Button>
          ) : null}
        </div>
        <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center">
          <p className="text-sm text-muted">
            No Projects are assigned to you yet.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">Recent Projects</h2>
        <Button href="/projects" variant="ghost" size="sm">
          View all
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((project) => (
          <Card key={project.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link
                  href={`/projects/${project.slug}`}
                  className="cursor-pointer text-base font-semibold text-foreground hover:underline"
                >
                  {project.name}
                </Link>
                <p className="mt-1 text-xs text-muted">
                  {formatProjectNumber(project.project_number)}
                </p>
              </div>
              <ProjectStatusBadge status={project.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ProjectTypeLabel projectType={project.project_type} />
              <ProjectAccessBadge accessLevel={project.accessLevel} />
            </div>
            <p className="mt-3 text-xs text-muted">
              Updated {formatProjectDate(project.updated_at)}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
