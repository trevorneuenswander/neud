import { OverviewEngineStatistics } from "@/components/projects/OverviewEngineStatistics";
import { ProjectActivityPanel } from "@/components/projects/ProjectActivityPanel";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { DisclosureSection } from "@/components/ui/DisclosureSection";
import { UsersWithAccessSection } from "@/components/projects/UsersWithAccessSection";
import { formatProjectDate } from "@/lib/projects/format";
import type { ProjectCreator } from "@/lib/displays/creator";
import type { ProjectAccessContext } from "@/lib/projects/types";
import type {
  DataEngineLog,
  DataEngineSnapshot,
  DataEngineStatus,
  WebpageScraperSettings,
} from "@/lib/data-engines/types";

type OverviewScraperStats = {
  engineId: string;
  status: DataEngineStatus | null;
  settings: WebpageScraperSettings | null;
  recentSnapshots: DataEngineSnapshot[];
  logs: DataEngineLog[];
};

type ProjectOverviewProps = {
  access: ProjectAccessContext;
  creator: ProjectCreator;
  scraperStats?: OverviewScraperStats | null;
};

export function ProjectOverview({
  access,
  creator,
  scraperStats = null,
}: ProjectOverviewProps) {
  const { project } = access;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold text-foreground">{project.name}</h2>
          <ProjectStatusBadge status={project.status} />
        </div>
        {project.description ? (
          <p className="max-w-3xl text-sm leading-6 text-muted">
            {project.description}
          </p>
        ) : null}
      </div>

      {scraperStats ? (
        <OverviewEngineStatistics
          engineId={scraperStats.engineId}
          initialStatus={scraperStats.status}
          initialSettings={scraperStats.settings}
          initialRecentSnapshots={scraperStats.recentSnapshots}
          initialLogs={scraperStats.logs}
        />
      ) : null}

      <ProjectActivityPanel
        projectId={project.id}
        projectName={project.name}
        projectSlug={project.slug}
        projectEngineIds={scraperStats ? [scraperStats.engineId] : []}
      />

      <UsersWithAccessSection
        projectId={project.id}
        projectSlug={project.slug}
        projectName={project.name}
        canManageMembers={access.canManageMembers}
        canViewEmails={
          access.projectRole === "owner" ||
          access.canManageSettings ||
          access.canManageMembers
        }
      />

      <DisclosureSection title="Project metadata">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Project type</dt>
            <dd className="text-foreground">Webpage Scraper</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Creator</dt>
            <dd className="text-right">
              <div className="text-foreground">{creator.name}</div>
              <div className="text-xs text-muted">{creator.email}</div>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Created</dt>
            <dd className="text-foreground">{formatProjectDate(project.created_at)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Updated</dt>
            <dd className="text-foreground">{formatProjectDate(project.updated_at)}</dd>
          </div>
        </dl>
      </DisclosureSection>
    </div>
  );
}
