import { normalizeProjectIsActive } from "@/lib/projects/project-permissions";

type ProjectVisibilityBadgeProps = {
  isActive: boolean;
};

const visibilityClasses = {
  active: "border-success/30 bg-success/10 text-success",
  inactive: "border-border bg-surface-raised text-muted",
} as const;

export function ProjectVisibilityBadge({ isActive }: ProjectVisibilityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${
        isActive ? visibilityClasses.active : visibilityClasses.inactive
      }`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export function projectListVisibility(project: {
  is_active?: boolean | number | null;
  isActive?: boolean | null;
}) {
  return normalizeProjectIsActive(project);
}
