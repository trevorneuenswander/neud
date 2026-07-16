import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/portal/PageHeader";
import { requireUser } from "@/lib/auth/authorization";

export default async function ProjectsPage() {
  await requireUser();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projects"
        description="Projects organize displays, controllers, workers, and assigned members for a graphics production."
        action={
          <Button href="/projects/new" variant="secondary" disabled>
            New Project
          </Button>
        }
      />
      <EmptyState
        title="No Projects yet"
        description="Project management is not configured in this phase. When available, each Project may include displays, controllers, workers, and members."
      />
    </div>
  );
}
