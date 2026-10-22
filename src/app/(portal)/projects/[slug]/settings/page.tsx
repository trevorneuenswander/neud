import { DeleteProjectSection } from "@/components/projects/DeleteProjectSection";
import { ProjectCapabilitiesEditor } from "@/components/projects/ProjectCapabilitiesEditor";
import { ProjectSettingsForm } from "@/components/projects/ProjectSettingsForm";
import { PageHeader } from "@/components/portal/PageHeader";
import { Card } from "@/components/ui/Card";
import { requireProjectSettingsAccess } from "@/lib/projects/authorization";
import { getProjectPlatformAccess } from "@/lib/projects/platform-access";
import { normalizeProjectIsActive } from "@/lib/projects/project-permissions";
import { shouldUseLocalData } from "@/lib/local/mode";
import { localGetProjectCapabilities } from "@/lib/local/api";
import {
  defaultCapabilitiesForProjectType,
  normalizeCapabilityIds,
} from "@/lib/projects/capabilities";

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

  let capabilities = defaultCapabilitiesForProjectType(
    access.project.project_type,
  );
  if (shouldUseLocalData()) {
    try {
      const payload = await localGetProjectCapabilities(slug);
      const normalized = normalizeCapabilityIds(payload.capabilities);
      if (normalized.length) {
        capabilities = normalized;
      }
    } catch {
      // Defaults already set.
    }
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

      {shouldUseLocalData() ? (
        <ProjectCapabilitiesEditor
          projectSlug={slug}
          initialCapabilities={capabilities}
        />
      ) : null}

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
