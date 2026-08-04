import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type ProjectEmptyStateProps = {
  showNewProjectAction?: boolean;
  isLocalMode?: boolean;
};

export function ProjectEmptyState({
  showNewProjectAction = false,
  isLocalMode = false,
}: ProjectEmptyStateProps) {
  return (
    <EmptyState
      title="No local projects yet"
      description={
        isLocalMode
          ? "Create a project or import projects from Supabase in Settings → Data & Backups."
          : "Projects organize displays, controllers, workers, and assigned members for a graphics production."
      }
      action={
        showNewProjectAction ? (
          <div className="flex flex-wrap gap-2">
            <Button href="/projects/new" variant="secondary">
              New Project
            </Button>
            {isLocalMode ? (
              <Link
                href="/settings"
                className="inline-flex h-10 items-center rounded-md border border-border bg-surface-raised px-4 text-sm font-medium text-foreground hover:bg-surface"
              >
                Open Settings
              </Link>
            ) : null}
          </div>
        ) : undefined
      }
    />
  );
}
