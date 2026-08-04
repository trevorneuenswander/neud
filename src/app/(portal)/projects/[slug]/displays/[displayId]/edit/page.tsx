import { notFound } from "next/navigation";
import { DisplayEditClient } from "@/components/displays/DisplayEditClient";
import { requireProjectAccess } from "@/lib/projects/authorization";

type DisplayEditPageProps = {
  params: Promise<{ slug: string; displayId: string }>;
};

export default async function DisplayEditPage({ params }: DisplayEditPageProps) {
  const { slug, displayId } = await params;
  const access = await requireProjectAccess(slug);
  if (!access.canManageSettings) {
    notFound();
  }

  return (
    <DisplayEditClient
      projectSlug={slug}
      projectName={access.project.name}
      displayId={displayId}
    />
  );
}
