import { DeleteProjectSection } from "@/components/projects/DeleteProjectSection";
import { ProjectSettingsForm } from "@/components/projects/ProjectSettingsForm";
import { PageHeader } from "@/components/portal/PageHeader";
import { Card } from "@/components/ui/Card";
import { requireProjectSettingsAccess } from "@/lib/projects/authorization";
import { getProjectPlatformAccess } from "@/lib/projects/platform-access";
import { normalizeProjectIsActive } from "@/lib/projects/project-permissions";

type ProjectSettingsPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProjectSettingsPage({
  params,
}: ProjectSettingsPageProps) {
  const { slug } = await params;

  let access;
  let platformAccess;
  try {
    access = await requireProjectSettingsAccess(slug);
    platformAccess = await getProjectPlatformAccess();
  } catch (error) {
    console.error("[settings] Failed to load project settings");
    throw error;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Project settings and administrative actions."
      />

      <ProjectSettingsForm
        projectSlug={slug}
        initialName={access.project.name}
        initialDescription={access.project.description}
        initialIsActive={normalizeProjectIsActive(access.project)}
      />

      {platformAccess.canDeleteProject ? (
        <section className="space-y-3">
          <Card className="border-danger/40">
            <DeleteProjectSection
              projectId={access.project.id}
              projectName={access.project.name}
              projectSlug={slug}
              layout="danger-zone"
            />
          </Card>
        </section>
      ) : null}
    </div>
  );
}
