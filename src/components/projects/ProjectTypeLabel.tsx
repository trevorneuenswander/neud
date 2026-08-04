import type { ProjectDataType } from "@/lib/projects/constants";
import { formatProjectDataType } from "@/lib/projects/format";

type ProjectTypeLabelProps = {
  projectType: ProjectDataType;
};

export function ProjectTypeLabel({ projectType }: ProjectTypeLabelProps) {
  return (
    <span className="text-sm text-foreground">
      {formatProjectDataType(projectType)}
    </span>
  );
}
