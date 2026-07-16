import { ProjectAccessBadge } from "@/components/projects/ProjectAccessBadge";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { ProjectTypeLabel } from "@/components/projects/ProjectTypeLabel";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import {
  formatProjectDate,
  formatProjectNumber,
  isValidHexColor,
} from "@/lib/projects/format";
import type { ProjectAccessContext } from "@/lib/projects/types";

type ProjectOverviewProps = {
  access: ProjectAccessContext;
  ownerName: string | null;
  memberCount: number | null;
};

export function ProjectOverview({
  access,
  ownerName,
  memberCount,
}: ProjectOverviewProps) {
  const { project } = access;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold text-foreground">{project.name}</h2>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>{formatProjectNumber(project.project_number)}</span>
          <ProjectTypeLabel projectType={project.project_type} />
          <ProjectAccessBadge accessLevel={access.accessLevel} />
        </div>
        {project.description ? (
          <p className="max-w-3xl text-sm leading-6 text-muted">
            {project.description}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Displays"
          value="—"
          detail="Not configured"
          state="unavailable"
        />
        <StatCard
          label="Controllers"
          value="—"
          detail="Not configured"
          state="unavailable"
        />
        <StatCard
          label="Workers"
          value="—"
          detail="Not configured"
          state="unavailable"
        />
        <StatCard
          label="Members"
          value={memberCount !== null ? String(memberCount) : "—"}
          detail={
            access.canManageMembers ? "Managed in Members tab" : "Assigned members"
          }
          state={memberCount !== null ? "default" : "unavailable"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold text-foreground">Project metadata</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Owner</dt>
              <dd className="text-foreground">{ownerName ?? "Unknown"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Created</dt>
              <dd className="text-foreground">{formatProjectDate(project.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Updated</dt>
              <dd className="text-foreground">{formatProjectDate(project.updated_at)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Theme</dt>
              <dd className="text-foreground">{project.theme}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Icon</dt>
              <dd className="text-foreground">{project.icon}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-foreground">Branding</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Primary color</dt>
              <dd className="flex items-center gap-2 text-foreground">
                {project.primary_color && isValidHexColor(project.primary_color) ? (
                  <>
                    <span
                      className="inline-block h-4 w-4 rounded border border-border"
                      style={{ backgroundColor: project.primary_color }}
                      aria-hidden="true"
                    />
                    {project.primary_color}
                  </>
                ) : (
                  "Not set"
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Secondary color</dt>
              <dd className="flex items-center gap-2 text-foreground">
                {project.secondary_color && isValidHexColor(project.secondary_color) ? (
                  <>
                    <span
                      className="inline-block h-4 w-4 rounded border border-border"
                      style={{ backgroundColor: project.secondary_color }}
                      aria-hidden="true"
                    />
                    {project.secondary_color}
                  </>
                ) : (
                  "Not set"
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Logo URL</dt>
              <dd className="break-all text-right text-foreground">
                {project.logo_url ?? "Not set"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
