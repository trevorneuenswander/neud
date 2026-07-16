import { ProjectPlaceholderPage } from "@/components/projects/ProjectPlaceholderPage";
import { requireProjectAccess } from "@/lib/projects/authorization";

type ProjectSettingsPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProjectSettingsPage({
  params,
}: ProjectSettingsPageProps) {
  const { slug } = await params;
  await requireProjectAccess(slug);

  return (
    <ProjectPlaceholderPage
      title="Settings"
      description="Project settings and slug management will be configurable in a future phase."
    />
  );
}
