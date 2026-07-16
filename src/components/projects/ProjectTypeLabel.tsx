import type { ProjectType } from "@/lib/projects/constants";
import { formatProjectType } from "@/lib/projects/format";

type ProjectTypeLabelProps = {
  projectType: ProjectType;
};

export function ProjectTypeLabel({ projectType }: ProjectTypeLabelProps) {
  return (
    <span className="text-sm text-foreground">{formatProjectType(projectType)}</span>
  );
}
