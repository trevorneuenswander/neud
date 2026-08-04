import Link from "next/link";
import { ProjectsPageClient } from "@/components/projects/ProjectsPageClient";
import { PageHeader } from "@/components/portal/PageHeader";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { requireUser } from "@/lib/auth/authorization";
import { shouldUseLocalData } from "@/lib/local/mode";
import { getProjectPlatformAccess } from "@/lib/projects/platform-access";
import { getVisibleProjects } from "@/lib/projects/queries";

type ProjectsPageProps = {
  searchParams: Promise<{
    q?: string;
    query?: string;
  }>;
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  await requireUser();
  const platformAccess = await getProjectPlatformAccess();
  const params = await searchParams;
  const query = params.q ?? params.query ?? "";
  const isLocalMode = shouldUseLocalData();

  if (isLocalMode) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Projects"
          description="Projects organize displays, controllers, workers, and assigned members for a graphics production."
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

        <ProjectsPageClient
          initialQuery={query}
          canCreateProject={platformAccess.canCreateProject}
        />
      </div>
    );
  }

  const projects = await getVisibleProjects(query);
  const viewerMode = false;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projects"
        description="Projects organize displays, controllers, workers, and assigned members for a graphics production."
        action={
          platformAccess.canCreateProject ? (
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

      <ProjectsPageClient
        initialQuery={query}
        canCreateProject={platformAccess.canCreateProject}
        hostedProjects={projects}
        hostedViewerMode={viewerMode}
      />
    </div>
  );
}
