import { MicTallyDataSourceClient } from "@/components/mic-tally/MicTallyDataSourceClient";
import { CapabilityModulePlaceholder } from "@/components/projects/CapabilityModulePlaceholder";
import { PageHeader } from "@/components/portal/PageHeader";
import { requireProjectAccess } from "@/lib/projects/authorization";
import {
  projectSupportsMicTallyWorkflow,
  projectSupportsSemaWorkflow,
} from "@/lib/projects/constants";
import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ slug: string }> };

export default async function DataSourceModulePage({ params }: PageProps) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug);
  if (projectSupportsSemaWorkflow(access.project.project_type)) {
    redirect(`/projects/${slug}/google-sheet`);
  }
  if (projectSupportsMicTallyWorkflow(access.project.project_type)) {
    return (
      <MicTallyDataSourceClient
        projectSlug={slug}
        projectId={access.project.id}
        canManage={access.canManageSettings}
      />
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Source"
        description="Structured data connection module."
      />
      <CapabilityModulePlaceholder capabilityId="data-source" />
    </div>
  );
}
