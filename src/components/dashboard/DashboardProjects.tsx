import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ProjectSummaryCard } from "@/components/projects/ProjectSummaryCard";
import type { DashboardProjectSummary } from "@/lib/dashboard/types";

type DashboardProjectsProps = {
  projects: DashboardProjectSummary[];
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
          <p className="text-sm text-muted">No Projects are assigned to you yet.</p>
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
          <ProjectSummaryCard
            key={project.id}
            project={{
              id: project.id,
              slug: project.slug,
              name: project.name,
              description: project.description,
              href: `/projects/${project.slug}`,
              isActive: project.isActive,
              updatedAt: project.updatedAt,
            }}
          />
        ))}
      </div>
    </section>
  );
}
