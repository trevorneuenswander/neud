import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type ProjectEmptyStateProps = {
  showNewProjectAction?: boolean;
};

export function ProjectEmptyState({
  showNewProjectAction = false,
}: ProjectEmptyStateProps) {
  return (
    <EmptyState
      title="No Projects yet"
      description="Projects organize displays, controllers, workers, and assigned members for a graphics production."
      action={
        showNewProjectAction ? (
          <Button href="/projects/new" variant="secondary">
            New Project
          </Button>
        ) : undefined
      }
    />
  );
}
