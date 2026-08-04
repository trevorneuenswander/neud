import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { formatRelativeTime, formatAbsoluteDateTime } from "@/lib/data-engines/format";

export type ProjectSummaryCardModel = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  href: string;
  isActive?: boolean;
  updatedAt?: string | null;
  metaLabel?: string | null;
};

function formatDescription(description: string | null | undefined): string | null {
  const trimmed = description?.trim();
  return trimmed ? trimmed : null;
}

export function ProjectSummaryCard({
  project,
}: {
  project: ProjectSummaryCardModel;
}) {
  const showStatus = typeof project.isActive === "boolean";
  const showUpdated = Boolean(project.updatedAt);
  const showMeta = Boolean(project.metaLabel);
  const description = formatDescription(project.description ?? null);

  return (
    <Link
      href={project.href}
      className="recent-project-card block rounded-lg no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`Open ${project.name}`}
    >
      <Card className="h-full transition-colors hover:bg-surface-raised">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">{project.name}</p>
            {description ? (
              <p className="mt-1 text-sm text-muted">{description}</p>
            ) : null}
          </div>
          {showStatus ? (
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                project.isActive
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-border bg-surface-raised text-muted"
              }`}
            >
              {project.isActive ? "Active" : "Inactive"}
            </span>
          ) : null}
        </div>
        {showUpdated ? (
          <p
            className="mt-3 text-xs text-muted"
            title={formatAbsoluteDateTime(project.updatedAt!)}
          >
            Updated {formatRelativeTime(project.updatedAt!)}
          </p>
        ) : null}
        {showMeta ? (
          <p className="mt-3 text-xs text-muted">{project.metaLabel}</p>
        ) : null}
      </Card>
    </Link>
  );
}
