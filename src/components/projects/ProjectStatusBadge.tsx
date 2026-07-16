import type { ProjectStatus } from "@/lib/projects/constants";
import { formatProjectStatus } from "@/lib/projects/format";

const statusClasses: Record<ProjectStatus, string> = {
  draft: "border-border bg-surface-raised text-muted",
  active: "border-success/30 bg-success/10 text-success",
  maintenance: "border-warning/30 bg-warning/10 text-warning",
  archived: "border-danger/30 bg-danger/10 text-danger",
};

type ProjectStatusBadgeProps = {
  status: ProjectStatus;
};

export function ProjectStatusBadge({ status }: ProjectStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${statusClasses[status]}`}
    >
      {formatProjectStatus(status)}
    </span>
  );
}
