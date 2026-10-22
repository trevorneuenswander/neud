import { SemaGoogleSheetClient } from "@/components/sema/SemaGoogleSheetClient";
import { shouldUseLocalData } from "@/lib/local/mode";
import { projectSupportsSemaWorkflow } from "@/lib/projects/constants";
import { requireProjectAccess } from "@/lib/projects/authorization";
import { notFound } from "next/navigation";

type GoogleSheetPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function SemaGoogleSheetPage({ params }: GoogleSheetPageProps) {
  const { slug } = await params;

  if (!shouldUseLocalData()) {
    notFound();
  }

  const access = await requireProjectAccess(slug);
  if (!projectSupportsSemaWorkflow(access.project.project_type)) {
    notFound();
  }

  return (
    <SemaGoogleSheetClient
      projectSlug={slug}
      canConfigure={access.canManageSettings}
      canControl={access.projectRole !== "viewer"}
    />
  );
}
