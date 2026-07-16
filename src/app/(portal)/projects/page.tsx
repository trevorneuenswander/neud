import Link from "next/link";
import { ProjectEmptyState } from "@/components/projects/ProjectEmptyState";
import { ProjectList } from "@/components/projects/ProjectList";
import { PageHeader } from "@/components/portal/PageHeader";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { isAdmin, requireUser } from "@/lib/auth/authorization";
import { getVisibleProjects } from "@/lib/projects/queries";

type ProjectsPageProps = {
  searchParams: Promise<{
    q?: string;
    query?: string;
  }>;
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  await requireUser();
  const admin = await isAdmin();
  const params = await searchParams;
  const query = params.q ?? params.query ?? "";
  const projects = await getVisibleProjects(query);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projects"
        description="Projects organize displays, controllers, workers, and assigned members for a graphics production."
        action={
          admin ? (
            <Button href="/projects/new" variant="secondary">
              New Project
            </Button>
          ) : undefined
        }
      />

      <form method="get" className="max-w-md">
        <FormField
          id="q"
          name="q"
          label="Search Projects"
          placeholder="Search by Project name"
          required={false}
          defaultValue={query}
        />
        <div className="mt-3">
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
          {query ? (
            <Link
              href="/projects"
              className="ml-3 cursor-pointer text-sm text-muted hover:text-foreground"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {projects.length > 0 ? (
        <ProjectList projects={projects} />
      ) : (
        <ProjectEmptyState showNewProjectAction={admin} />
      )}
    </div>
  );
}
