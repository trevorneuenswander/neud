import type { ProjectAccessLevelWithAdmin } from "@/lib/projects/constants";
import { formatProjectAccessLevel } from "@/lib/projects/format";

type ProjectAccessBadgeProps = {
  accessLevel: ProjectAccessLevelWithAdmin;
};

export function ProjectAccessBadge({ accessLevel }: ProjectAccessBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-muted">
      {formatProjectAccessLevel(accessLevel)}
    </span>
  );
}
